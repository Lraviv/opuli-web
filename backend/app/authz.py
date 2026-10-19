"""עזרים שמוודאים שמשאב מבוקש (תואר/קורס/מבחן/פריט) שייך למשתמש המחובר.

תמיד מחזירים 404 ולא 403 כשהמשאב לא שייך - כדי לא לחשוף למשתמש שהמזהה
בכלל קיים במסד (אותו עיקרון שמוזכר במסמך האיפיון לגבי פרטיות בין משתמשים).
"""

from fastapi import HTTPException, status
from sqlmodel import Session

from .config import settings
from .models import CatalogCourse, Course, CourseItem, Degree, Exam, Semester, User


def is_admin(user: User) -> bool:
    """מנהלות OpuLi (ADMIN_EMAILS): מפרסמות בשם הצוות, נועצות ומסתירות פוסטים."""
    admins = {e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()}
    return user.email.lower() in admins


def get_owned_degree(degree_id: int, user_id: int, session: Session) -> Degree:
    degree = session.get(Degree, degree_id)
    if degree is None or degree.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="תואר לא נמצא")
    return degree


def get_catalog_course_in_own_degree(catalog_course_id: int, user_id: int, session: Session) -> CatalogCourse:
    catalog_course = session.get(CatalogCourse, catalog_course_id)
    if catalog_course is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="קורס בקטלוג לא נמצא")
    # מוודאים שהתואר שמחזיק את הקורס הזה שייך למשתמש
    get_owned_degree(catalog_course.degree_id, user_id, session)
    return catalog_course


def get_owned_course(course_id: int, user_id: int, session: Session) -> Course:
    course = session.get(Course, course_id)
    if course is None or course.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="קורס לא נמצא")
    return course


def get_owned_course_item(item_id: int, user_id: int, session: Session) -> CourseItem:
    item = session.get(CourseItem, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="פריט לא נמצא")
    get_owned_course(item.course_id, user_id, session)
    return item


def get_owned_exam(exam_id: int, user_id: int, session: Session) -> Exam:
    exam = session.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="מבחן לא נמצא")
    # מוודאים שהקורס שמחזיק את המבחן שייך למשתמש
    get_owned_course(exam.course_id, user_id, session)
    return exam


def get_owned_semester(semester_id: int, user_id: int, session: Session) -> Semester:
    semester = session.get(Semester, semester_id)
    if semester is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="סמסטר לא נמצא")
    # מוודאים שהתואר שמחזיק את הסמסטר הזה שייך למשתמש
    get_owned_degree(semester.degree_id, user_id, session)
    return semester
