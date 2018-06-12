"use strict";
const uuid = require('uuid/v4');
const queryBuilder = require('./queryBuilder');
const librarian = require('./librarian');
const fs = require('fs');
const mime = require('mime-types');
const crypto = require('crypto');
const path = require('path');
const exec = require('child_process').execFileSync;


module.exports = function(bot) {
  // First ingestion point.
  this.handleMessage = function(msg) {
    bot.logger.info(JSON.stringify(msg))

    // This is not necessarily the UUID in our graph. Be careful.
    var workingUuid = uuid();

    // Get the message.
    var libr = new librarian(bot);
    return libr.download(msg.Library, msg.Path, "/tmp/"+workingUuid).then((tmpPath) => {
      var mimeFromName = mime.lookup(msg.Path);
      var mimeFromData = getFileMimetype(tmpPath);

      var fileObj = {
        Library: msg.Library,
        Path: msg.Path,
        params: {
          CrawlDateTime: msg.Timestamp,
          MimeType: mimeFromData || mimeFromName || 'application/octet-stream',
          Size: fs.statSync(tmpPath).size,
          Name: msg.Path,
          Extension: msg.Path.basename
        }
      }

      return getChecksum(tmpPath).then((sum) => {
        fileObj.SHA256 = sum;
        var query = queryBuilder.addFile(fileObj, workingUuid);
        return bot.neo4j.query(query.compile(), query.params());
      })

    }).catch((err) => {
      bot.logger.error(err.toString());
    });
  }

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
      return stdout.substring(stdout.lastIndexOf(' ')).trim();
    }
    catch(err) {
      console.log(err);
      return null;
    }
  }
}
