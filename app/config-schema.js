/**
 * Copyright (c) 2017 Menome Technologies Inc.
 * Configuration for the bot
 */
"use strict";

module.exports = {
  minio: {
    endPoint: {
      doc: "The URL of the Minio instance",
      format: "*",
      default: "minio",
      env: "MINIO_HOSTNAME"
    },
    port: {
      doc: "The Port of the Minio instance",
      format: "port",
      default: 9000,
      env: "MINIO_PORT"
    },
    secure: {
      doc: "Do we use SSL to connect to Minio?",
      format: "Boolean",
      default: false,
      env: "MINIO_SECURE"
    },
    accessKey: {
      doc: "S3-Style Access Key for Minio",
      format: "*",
      default: 'abcd123',
      env: "MINIO_ACCESS_KEY"
    },
    secretKey: {
      doc: "S3-Style Secret Key for Minio",
      format: "*",
      default: 'abcd12345',
      env: "MINIO_SECRET_KEY",
      sensitive: true
    },
    fileBucket: {
      doc: "The name of the bucket we'll crawl on full sync",
      format: "*",
      default: 'filestore'
    }
  },
  // librarian: {
  //   enable: {
  //     doc: "Whether we're using the file librarian.",
  //     format: "Boolean",
  //     default: false,
  //     env: "LIBRARIAN_ENABLE"
  //   },
  //   host: {
  //     doc: "URL of the File Librarian",
  //     format: "String",
  //     default: "localhost:3020",
  //     env: "LIBRARIAN_HOST"
  //   },
  //   secret: {
  //     doc: "Secret for signing JWT to be carried to the File Librarian",
  //     format: "String",
  //     default: "nice web mister crack spider",
  //     env: "LIBRARIAN_SECRET",
  //     sensitive: true
  //   },
  //   username: {
  //     doc: "Username for Librarian access",
  //     format: "String",
  //     default: "admin",
  //     env: "LIBRARIAN_USERNAME"
  //   },
  //   password: {
  //     doc: "Password for Librarian access",
  //     format: "String",
  //     default: "password",
  //     env: "LIBRARIAN_PASSWORD",
  //     sensitive: true
  //   }
  // }
};