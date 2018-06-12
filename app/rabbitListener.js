/*
 * Copyright (C) 2017 Menome Technologies Inc.
 *
 * Connects to rabbitmq and listens for messages from minio events.
 * Updates the DB based on the event details. (Adding files, deleting, etc.)
 */
"use strict";
var conf = require('./config');
var amqp = require('amqplib/callback_api');
var bot = require('@menome/botframework');
var queryBuilder = require('./queryBuilder');
var linkOperations = require('./linkOperations');
var rabbitConnectInterval;

// Our outbound rabbit connection.
var rabbit = require('@menome/botframework/src/rabbit');
var rabbitClientOutgoing = new rabbit(conf.get("rabbit_outgoing"))
rabbitClientOutgoing.connect();

module.exports = {
  rabbitClientOutgoing,
  handleMessage,
  addNode,
  deleteNode
}

// Handles a message. Message should be a JSON blob.
function handleMessage(msg) {
  if (!Array.isArray(msg.Records) || msg.Records.length < 1) return Promise.resolve(true);
  var fileObj = msg.Records[0].s3.object;

  // ignorge folders
  if (fileObj.contentType === 'application/x-directory' || fileObj.contentType === 'application/octet-stream') {
    return Promise.resolve(true);
  }

  fileObj.name = msg.Key; //TODO: Remove this. It doesn't conflict with any S3 schema but I don't like it.
  fileObj.urlWithBucket = msg.Key;

  // If we created an object
  if (/s3:ObjectCreated:*/.test(msg.EventType)) {
    fileObj.lastModified = new Date(msg.Records[0].eventTime);
    return addNode(fileObj).then(function (uuid) {
      return linkOperations.linkFile(msg, uuid).then((result) => {
        bot.logger.info("Operations finished. Placing on outgoing queue.")
        var tm = {
          "Key":msg.Key,
          "EventType":msg.EventType,
        }
        rabbitClientOutgoing.publishMessage(tm)
        return Promise.resolve(true)
      })
    });
  } else if (/s3:ObjectRemoved:*/.test(msg.EventType)) {
    return deleteNode(fileObj);
  } else {
    return Promise.resolve(true);
  }
}

// Adds a new node for a file.
function addNode(fileObj) {
  fileObj.importId = bot.genUuid();

  var newUuid = bot.genUuid();
  var queryObj = queryBuilder.addFileQuery(fileObj, newUuid);
  var linkQueries = queryBuilder.fileConnectionQueries(fileObj);

  return bot.query(queryObj.compile(), queryObj.params())
    .then(function (result) {
      // Then create our links.
      linkQueries.forEach(function (val) {
        bot.query(val.compile(), val.params())
          .then(function (result) {
            return result;
          })
      })
      bot.logger.info("Added node for new file: '%s'", fileObj.urlWithBucket);

      return result.records[0].get('uuid');
    })
    .catch(function (err) {
      bot.logger.info("Could not add node for new file '%s': %s", fileObj.urlWithBucket, err.code);
    })
}

// Run when a FILE is deleted in Minio. Deletes the NODE in the graph.
function deleteNode(fileObj) {
  var shouldDeleteQuery = queryBuilder.persistFileQuery(fileObj.urlWithBucket)
  return bot.query(shouldDeleteQuery.compile(), shouldDeleteQuery.params()).then((result) => {
    // If the file got deleted because we're not persisting it, just return true without deleting it from the graph.
    if(!!result.records && result.records.length > 0 && result.records[0].get('persist') !== true)
      return Promise.resolve(true);
      
    var queryObj = queryBuilder.removeFileQuery(fileObj);

    return bot.query(queryObj.compile(), queryObj.params())
      .then(function (result) {
        bot.logger.info("Deleted node for '%s'.", fileObj.urlWithBucket);
        return result;
      })
  }).catch(function (err) {
    bot.logger.error("Failed to delete node for '%s'. Error message was: %s", fileObj.urlWithBucket, err.message);
    return result;
  })
}