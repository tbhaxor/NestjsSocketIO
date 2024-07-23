FROM node:20.15.1-alpine

RUN adduser -h /usr/share/app -D app
USER app
WORKDIR /usr/share/app

COPY --chown=app:app ./node_modules ./node_modules
COPY --chown=app:app ./dist/main.js ./

EXPOSE 3000

CMD [ "./main.js" ]