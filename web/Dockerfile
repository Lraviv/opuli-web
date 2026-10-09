# האתר של OpuLi ל-Cloud Run: בונים עם Vite ומגישים את dist עם nginx.
# משתני VITE_* נצרבים לתוך הבנדל בזמן הבנייה, אז מעבירים אותם כ-build args.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Cloud Run מגדיר PORT; תבנית ה-nginx מחליפה אותו בעלייה.
ENV PORT=8080
