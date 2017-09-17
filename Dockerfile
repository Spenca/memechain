FROM node:6-slim

RUN npm install --global nodemon

COPY . /starter
COPY package.json /starter/package.json
COPY .env.example /starter/.env.example

WORKDIR /starter

RUN npm install

EXPOSE 8080
