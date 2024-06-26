# note that order matters in terms of docker build layers. Least changed near start to most changed...
# This image will be based on the official nodejs docker image
FROM node:10.15.0

EXPOSE 80
ENV PORT 80

# Necessary to determine if PDF files are ok.
RUN apt-get update && apt-get install -y ghostscript qpdf

# Commands will run in this directory
RUN mkdir /srv/app
WORKDIR /srv/app

# Add build file
COPY ./package.json package.json

# Newer compiled magic file for properly detecting ppt and whatnot.
COPY ./magic.mgc /root/.magic.mgc

# Install dependencies and generate production dist
ARG NPM_TOKEN
COPY .npmrc-deploy .npmrc
RUN npm install
RUN rm -f .npmrc

# Copy the code for the prod container.
# This seems to not cause any problems in dev when we mount a volume at this point.
COPY ./app app
COPY ./config config

CMD npm start
