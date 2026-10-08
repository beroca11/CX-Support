FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache wget
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
EXPOSE 4000
CMD ["npm", "start"]
