"""סקריפט CLI חד-פעמי (אך אידמפוטנטי - בטוח להריץ שוב) לתואר שכבר נוצר בלי
תבנית: ממלא את הקטלוג שלו מתוך תבנית "מדעי המחשב (האו"פ)" הקבועה
(app/catalog_templates.py - אותו מקור נתונים בדיוק שה-API משתמש בו כשיוצרים
תואר עם template="cs_open_university"), ומסמן כ"בתהליך"/"הושלם" את הקורסים
שכבר צוינו במסמך התכנון האישי שהועלה יחד עם התכנית.

**לרוב אין צורך בסקריפט הזה** - מספיק ליצור תואר חדש מהאפליקציה ולבחור
בתבנית "מדעי המחשב". הוא שימושי בעיקר לתואר שכבר נוצר ידנית לפני שהתבנית
הזו הייתה קיימת, או כדי לגבות/לתקן קטלוג קיים.

הרצה (מתוך תיקיית backend, עם venv מופעל):

    python scripts/seed_cs_catalog.py --email you@example.com

דגלים נוספים:
    --degree-name       שם התואר שייווצר/יעודכן (ברירת מחדל: לפי התבנית)
    --skip-progress     רק למלא את הקטלוג, בלי לסמן קורסים שכבר עשית/עושה
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from app.catalog_templates import get_template  # noqa: E402
from app.db import engine  # noqa: E402
from app.models import CatalogCourse, Course, CourseStatus, Degree, User  # noqa: E402

TEMPLATE_KEY = "cs_open_university"

# קורסים שכבר סומנו במסמך התכנון האישי שהועלה לצ'אט (סטטוס נכון לזמן ההעלאה).
# שם הקורס כאן חייב להיות זהה בדיוק לשם בתבנית (app/catalog_templates.py).
PERSONAL_PROGRESS = [
    ("מתמטיקה בדידה: תורת הקבוצות, קומבינטוריקה ותורת הגרפים", CourseStatus.done),
    ("אלגברה לינארית 1", CourseStatus.current),
    ("ארגון המחשב", CourseStatus.current),
]


def main() -> None:
    template = get_template(TEMPLATE_KEY)
    assert template is not None

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True, help="האימייל שנרשמת איתו לאפליקציה")
    parser.add_argument("--degree-name", default=template.name)
    parser.add_argument(
        "--skip-progress",
        action="store_true",
        help="רק למלא את הקטלוג, בלי לסמן קורסים שכבר עשית/עושה",
    )
    args = parser.parse_args()

    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == args.email)).first()
        if user is None:
            print(f"לא נמצא/ה משתמש/ת עם האימייל {args.email!r}. יש להירשם קודם דרך האפליקציה.")
            raise SystemExit(1)

        degree = session.exec(
            select(Degree).where(Degree.user_id == user.id, Degree.name == args.degree_name)
        ).first()
        if degree is None:
            degree = Degree(
                user_id=user.id,
                name=args.degree_name,
                institution=template.institution,
                target_credits=template.target_credits,
            )
            session.add(degree)
            session.commit()
            session.refresh(degree)
            print(f"נוצר תואר חדש: {degree.name} (id={degree.id})")
        else:
            print(f"נמצא תואר קיים: {degree.name} (id={degree.id}) - ממלאים את הקטלוג שלו")

        existing_names = set(
            session.exec(select(CatalogCourse.name).where(CatalogCourse.degree_id == degree.id)).all()
        )

        created = 0
        for course in template.courses:
            if course.name in existing_names:
                continue
            session.add(
                CatalogCourse(
                    degree_id=degree.id,
                    name=course.name,
                    credits=course.credits,
                    category=course.category,
                    notes=f"מספר קורס: {course.code}",
                )
            )
            created += 1
        session.commit()
        print(f"נוספו {created} קורסים חדשים לקטלוג (מתוך {len(template.courses)} בסך הכול בתבנית).")

        if not args.skip_progress:
            catalog_by_name = {
                cc.name: cc
                for cc in session.exec(select(CatalogCourse).where(CatalogCourse.degree_id == degree.id)).all()
            }
            already_selected_catalog_ids = set(
                session.exec(
                    select(Course.catalog_course_id).where(
                        Course.user_id == user.id, Course.catalog_course_id.is_not(None)
                    )
                ).all()
            )

            progress_created = 0
            for name, status in PERSONAL_PROGRESS:
                cc = catalog_by_name.get(name)
                if cc is None:
                    print(f"אזהרה: לא נמצא קורס בקטלוג בשם {name!r} - מדלגים")
                    continue
                if cc.id in already_selected_catalog_ids:
                    continue
                session.add(
                    Course(
                        user_id=user.id,
                        degree_id=degree.id,
                        catalog_course_id=cc.id,
                        name=cc.name,
                        credits=cc.credits,
                        status=status,
                    )
                )
                progress_created += 1
            session.commit()
            print(f"סומנו {progress_created} קורסים אישיים לפי הסטטוס שכבר צוין (הושלם/בתהליך).")

        print(
            '\nשימו לב: לא נכללה בקטלוג דרישת "בחירה חופשית" (9 נ"ז) - היא לא רשימת קורסים '
            'סגורה, אלא כל קורס מקטלוג האו"פ שאינו סמינריוני. אפשר להוסיף קורס כזה ידנית '
            'ממסך "הקורסים שלי" כשתדעי איזה קורס בחרת.'
        )


if __name__ == "__main__":
    main()
