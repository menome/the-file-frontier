"use strict";
const uuid = require('uuid/v4');
const queryBuilder = require('./queryBuilder');
const fs = require('fs');
const mime = require('mime-types');
const crypto = require('crypto');
const child_process = require('child_process');
const botSchema = require("@menome/botframework/helpers/schema");
const helpers = require('./helpers');

module.exports = function(bot) {
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
      if(res.action === "deleted") return bot.logger.info("Deleted file from graph.",{action:res.action,path:msg.Path});
      if(res.action === "pdffix") return bot.logger.info("Cleaned up and re-uploaded PDF file.",{action:res.action,path:msg.Path});

      // Make the message and decide where it should go next.
      bot.logger.info("Processed file", {action:res.action,path:msg.Path})
      var outMsg = {
        "Library": msg.Library,
        "Path": msg.Path,
        "Timestamp": msg.Timestamp,
        "Uuid": res.uuid, // The actual UUID.
        "Mime": res.mime // File's MIME type.
      };
      
      var newRoute = helpers.getNextRoutingKey(res.mime, bot);

      if(newRoute === false || newRoute === undefined) {
        return bot.logger.info("No next routing key.",{action:res.action,path:msg.Path});
      }

      if(typeof newRoute === "string") {
        bot.logger.info("Next routing key",{action:res.action,path:msg.Path,routingKey:newRoute})
        return bot.outQueue.publishMessage(outMsg, "fileProcessingMessage", {routingKey: newRoute});
      }
      else if(Array.isArray(newRoute)) {
        bot.logger.info("Next routing keys",{action:res.action,path:msg.Path,routingKey:newRoute.join(', ')})
        newRoute.forEach((rkey) => {
          return bot.outQueue.publishMessage(outMsg, "fileProcessingMessage", {routingKey: rkey});
        })
      }
      else
        bot.logger.error("Could not understand next routing key",{action:res.action,path:msg.Path,routingKey:newRoute.toString()})
    }).catch((err) => {
      bot.logger.error("error handling message",{msg:msg,error:err.toString(), stackTrace:err.stack});
    });
  }

  // Parses a bot message. Returns a promise that resolves with the created graph node's UUID.
  function handleBotMessage(msg) {
    // This is not necessarily the UUID in our graph. Be careful.
    var workingUuid = uuid();

    // Handle deletes separately.
    if(msg.EventType === "DELETE") {
      var query = queryBuilder.deleteFile(msg.Library, msg.Path);
      return bot.neo4j.query(query.compile(), query.params()).then(async (result) => {
        bot.logger.info("Attempting to remove thumbnails.");
        let deletedFileThumb = false;
        for(var i=0; i < result.records.length; i++) {
          let record = result.records[i];
          if(record.get('fileThumbLib') && !deletedFileThumb) {
            await bot.librarian.delete(record.get('fileThumbLib'), record.get('fileThumb'))
            deletedFileThumb = true;
          }

          // Don't try to delete if it's null. Because this uses an OPTIONAL MATCH
          if(record.get('fileImage')) {
            await bot.librarian.delete(record.get('fileImageLib'), record.get('fileImage'))
          }
          if(record.get('pageThumb')) {
            await bot.librarian.delete(record.get('pageThumbLib'), record.get('pageThumb'))
          }
        }

        return result.records;
      }).then(() => { return {action: "deleted"}; })
    }

    // Get the message.
    // var libr = new librarian(bot);
    return bot.librarian.download(msg.Library, msg.Path, "/tmp/"+workingUuid).then(async (tmpPath) => {
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

      // Check if we've already tried to fix the file.
      let attemptedFix = false;
      var checkFileQuery = queryBuilder.getFile(msg.Library, msg.Path);
      var fileResult = await bot.neo4j.query(checkFileQuery.compile(), checkFileQuery.params())
      if(fileResult.records.length > 0 && fileResult.records[0].get("attemptedfix")) {
        attemptedFix = true;
      }

      // If it's a PDF file, check/fix it.
      if(!attemptedFix && mimeFromData === "application/pdf") {
        let corrupt = await isPDFCorrupt(tmpPath)

        if(corrupt) {
          attemptedFix = true;
          bot.logger.info("PDF Corrupt. Attempting to fix.")
          let fixedPdfPath = await fixPDF(tmpPath)
          
          // Check if it actually fixed.
          let fixFailed = await isPDFCorrupt(fixedPdfPath)
          if (!fixFailed) {
            let fileName = msg.Path.substring(msg.Path.lastIndexOf('/')+1)
            let rs = fs.createReadStream(fixedPdfPath)

            return bot.librarian.upload(msg.Library, msg.Path, rs, msg.mimeFromData, fileName).then(() => {
              helpers.deleteFile(fixedPdfPath);
              return {action: "pdffix"};
            }).catch((err) => {
              helpers.deleteFile(fixedPdfPath);
              bot.logger.error(err)
              throw err
            })
          } else {
            bot.logger.info("Could not fix file. Refraining from reupload")
          }
        }
      }

      return getChecksum(tmpPath).then((sum) => {
        fileObj.params.SHA256 = sum;

        var query = queryBuilder.addFile(fileObj, workingUuid, attemptedFix);
        return bot.neo4j.query(query.compile(), query.params()).then((result) => {
          // bot.logger.info("Result", JSON.stringify(result));
          // bot.logger.info("Result", JSON.stringify(result.records[0].get("mime")));
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
      var stdout = child_process.execFileSync('file', args);
      stdout = stdout.toString();
      return stdout.substring(stdout.lastIndexOf(' ')).trim();
    }
    catch(err) {
      bot.logger.error(err)
      return null;
    }
  }

  // Resolves true if corrupt. False if not corrupt.
  function isPDFCorrupt(path) {
    return new Promise((resolve) => {
      bot.logger.info("Checking PDF")
      let errText = "";
      let proc = child_process.execFile('qpdf', ['--check', path]);

      proc.stderr.on("data", (chunk) => {
        errText += chunk.toString()
      })

      proc.on("exit", (code) => {
        if(code === 0) {
          return resolve(false)
        }
        else if(code === 3) {
          // Code 3 is just warnings.
          // But there is a bug where certain warnings are causing an error code
          // https://github.com/qpdf/qpdf/issues/50
          return resolve(false)
        }

        bot.logger.info(errText)
        return resolve(true)
      })
    })
  }

  // Attempts to fix the PDF. Returns the path to the fixed PDF.
  // This can throw exceptions
  function fixPDF(path) {
    return new Promise((resolve, reject) => {
      let outPath = path + "-fixed"
      let errText = "";
      let proc = child_process.execFile('qpdf', [path, outPath]);

      proc.stderr.on("data", (chunk) => {
        errText += chunk.toString()
      })

      proc.on("exit", (code) => {
        if(code === 0) {
          return resolve(outPath)
        }
        else if(code === 3) { // Code 3 is "Operation Succeeded with Warnings"
          return resolve(outPath)
        }

        // On error, delete our intermediate file.
        helpers.deleteFile(outPath);
        return reject(new Error(errText))
      })
    })
  }
}
