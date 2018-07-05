"use strict";
const uuid = require('uuid/v4');
const queryBuilder = require('./queryBuilder');
const fs = require('fs');
const mime = require('mime-types');
const crypto = require('crypto');
const exec = require('child_process').execFileSync;
const RabbitClient = require('@menome/botframework/rabbitmq');
const botSchema = require("@menome/botframework/helpers/schema");
const helpers = require('./helpers');

module.exports = function(bot) {
  var outQueue = new RabbitClient(bot.config.get('rabbit_outgoing'));
  outQueue.connect();

  // First ingestion point.
  this.handleMessage = function(msg) {
    var handlerFunc = () => {return Promise.reject("Could not find a processor for harvester message format: " + JSON.stringify(msg))};

    // If it conforms to the bot message schema, we know how to handle it.
    if(!botSchema.validate(botSchema.schemas.crawlerMessage, msg)) {
      handlerFunc = handleBotMessage;
    } else if(!!msg.EventName && msg.EventName.startsWith("s3:")) {// Minio/S3 type event. Convert to bot message.

      var eventtype = "CREATE";
      if(msg.EventName.match(/ObjectRemoved/))
        eventtype = "DELETE";

      var newMsg = {
        "Library": "miniofiles", //TODO: This should not be hard-coded. Bad times.
        "Path": msg.Key,
        "EventType": eventtype,
        "Timestamp": msg.time
      }

      msg = newMsg;
      handlerFunc = handleBotMessage;
    }

    return handlerFunc(msg).then((res) => {
      if(res.action === "deleted") return bot.logger.info("Deleted file from graph.");
      // Make the message and decide where it should go next.
      bot.logger.info("Processed file:", msg.Path)
      var outMsg = {
        "Library": msg.Library,
        "Path": msg.Path,
        "Timestamp": msg.Timestamp,
        "Uuid": res.uuid, // The actual UUID.
        "Mime": res.mime // File's MIME type.
      };

      var downstream_actions = bot.config.get('downstream_actions');
      var newRoutingKey = downstream_actions[res.mime];

      if(newRoutingKey === false || newRoutingKey === undefined) {
        return bot.logger.info("No next routing key.");
      }

      bot.logger.info("Next routing key is '%s'", newRoutingKey)

      return outQueue.publishMessage(outMsg, "fileProcessingMessage", {routingKey: newRoutingKey});
    }).catch((err) => {
      bot.logger.error(err.toString(), err.stack);
    });
  }

  // Parses a bot message. Returns a promise that resolves with the created graph node's UUID.
  function handleBotMessage(msg) {
    // This is not necessarily the UUID in our graph. Be careful.
    var workingUuid = uuid();

    // Handle deletes separately.
    if(msg.EventType === "DELETE") {
      var query = queryBuilder.deleteFile(msg.Library, msg.Path);
      return bot.neo4j.query(query.compile(), query.params()).then(() => { return {action: "deleted"}; })
    }

    // Get the message.
    // var libr = new librarian(bot);
    return bot.librarian.download(msg.Library, msg.Path, "/tmp/"+workingUuid).then((tmpPath) => {
      var mimeFromName = mime.lookup(msg.Path);
      var mimeFromData = getFileMimetype(tmpPath);

      var fileObj = {
        Library: msg.Library,
        Path: msg.Path,
        params: {
          CrawlDateTime: msg.Timestamp,
          MimeType: mimeFromData || mimeFromName || 'application/octet-stream',
          Size: fs.statSync(tmpPath).size,
          Name: msg.Path
        }
      }

      return getChecksum(tmpPath).then((sum) => {
        fileObj.SHA256 = sum;
        var query = queryBuilder.addFile(fileObj, workingUuid);
        return bot.neo4j.query(query.compile(), query.params()).then((result) => {
          var uuid = result.records[0].get("uuid");
          var mime = result.records[0].get("mime");
          helpers.deleteFile(tmpPath);
          return {uuid, mime};
        })
      }).catch((err) => {
        helpers.deleteFile(tmpPath);
        throw err; // And pass the exception up
      })
    })
  }

  //////////////////////////////
  // Internal/Helper functions

  // Gets a SHA256 Checksum of the file.
  function getChecksum(file) {
    var hash = crypto.createHash("sha256"); //Hash of file
    return new Promise(function(resolve, reject) {
      // Get the checksum here.
      var s = fs.ReadStream(file);
      s.on('data', function(d) { hash.update(d); });
      s.on('error', function(err) { return reject(err); });
      s.on('end', function() {
        var checksum = hash.digest('base64');
        return resolve(checksum);
      });
    })
  }

  function getFileMimetype(tmpPath) {
    var args = ['--mime-type', '--no-pad'];
    args.push(tmpPath)

    try {
      var stdout = exec('file', args);
      stdout = stdout.toString();
      return stdout.substring(stdout.lastIndexOf(' ')).trim();
    }
    catch(err) {
      bot.logger.error(err)
      return null;
    }
  }
}
