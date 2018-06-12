/**
 * Interfaces for interacting with the Librarian.
 */
// const rp = require('request-promise');
const fs = require('fs');
const request = require('request');
const URL = require('url').URL;

module.exports = function(bot) {
  this.download = (key,path,filePath) => {
    var url =  new URL('/file', bot.config.get("librarian.host"));
    
    url.searchParams.set("library",key);
    url.searchParams.set("path",path);
    var opts = {
      url: url.toString(),
      qs: {
        library: key,
        path: path
      },
      auth: {
        user: bot.config.get('librarian.username'),
        pass: bot.config.get('librarian.password'),
      }
    }

    return new Promise((resolve,reject) => {
      request(opts)
        .on('response', () => {
          return resolve(filePath);
        })
        .on('error', (err) => {
          return reject(err);
        })
        .pipe(fs.createWriteStream(filePath))
    });
  }
}