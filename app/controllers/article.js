/**
 * Allows users to post articles to be added to the graph.
 */
const uuidv4 = require('uuid/v4');
const metascraper = require('metascraper');
const extractor = require('unfluff');
const request = require('request');
const queryBuilder = require("../queryBuilder")
const helpers = require('@menome/botframework/helpers');

module.exports.swaggerDef = {
  "/article": {
    "x-swagger-router-controller": "article",
    "post": {
      "tags": [
        "Article"
      ],
      "parameters": [
        {
          "name": "url",
          "in": "query",
          "required": true,
          "description": "The Web URL of the article we are going to add.",
          "type": "string"
        }
      ],
      "responses": {
        "200": {
          "description": "Success"
        },
        "default": {
          "description": "Error"
        }
      }
    }
  }
}

module.exports.post = function(req,res) {
  var url = req.swagger.params.url.value;

  req.bot.logger.info("Adding URL:" + "<" + url + ">");
  //article info json blob
  addArticle(req.bot, url).then((err) => {
    if(err) return res.status(500).send(helpers.responseWrapper({
      status: "failure",
      message: "Failed to add Article"
    }))

    return res.send(
      helpers.responseWrapper({
        status: "success",
        message: "Added Article"
      })
    )
  })

  // if(!url) return res.status(400).send("Specify a URL.");
  // return req.registry.get(library, req, res);
}

function addArticle(bot, url) {
  return new Promise(function (resolve) {
    bot.logger.info("Articler has started.");
    var articleInfo = {
      "Name": "string",
      "Key": url.trim(),
      "NodeType": "string",
      "Properties": {
        "Description": "string",
        "ImageURL": "string",
        "FullText": "string",
        "Author": "string",
        "DatePublished": "string",
        "Publisher": "string",
      },
      "Connections": []
    };

    var actions = [];
    actions.push(extractMetadata(bot, url, articleInfo));
    actions.push(extractFullText(bot, url, articleInfo));

    // Wait for all actions to finish.
    Promise.all(actions)
      .then(function () {
        //bot.logger.info("Finished Extracting text\n" + JSON.stringify(articleInfo));
        //Now we need to add it to the neo4j graph
        //build the query
        var queryObj = queryBuilder.addArticleQuery(articleInfo, uuidv4());

        bot.neo4j.query(queryObj.compile(), queryObj.params())
          .then(function (result) {
            bot.logger.info(result)
            // var request = {
            //   EventType: "ModelArticle",
            //   Key: articleInfo.Key
            // }
            // bot.logger.info("Added Article info");

            // TODO: now we send over to the topic modeler
            // rabbit_outgoing.publishMessage(request)
            resolve();
          })
          .catch(function (error) {
            bot.logger.error("Could not add article info %s", error.message);
            resolve(error);
          })
      })
      .catch(function (error) {
        bot.logger.error("Operation failed: %s", error.message);
        resolve(error);
      });
  });
}

function extractFullText(bot, url, articleInfo) {
  bot.logger.info("Extracting fullText article");
  return new Promise(function (resolve) {
    request(url, function (error, response, body) {
      if (error) {
        return resolve(error);
      }
      var data = extractor(body);
      articleInfo.Properties.FullText = data.text.replace(/(\r\n|\n|\r)/gm, "").substr(0, 29000);
      // bot.logger.info(articleInfo.Properties.FullText);
      return resolve(response);
    })
  })
}

function extractMetadata(bot, url, articleInfo) {
  //use the metascraper to scrape the data
  return new Promise(function (resolve) {
    bot.logger.info("Starting Scraper on URL: <" + url + ">");
    metascraper.scrapeUrl(url).then((metadata) => {
      bot.logger.info("Scraper has returned!");
      articleInfo.Name = metadata.title;
      articleInfo.NodeType = 'Article';
      articleInfo.Properties.Description = metadata.description;
      articleInfo.Properties.ImageURL = metadata.image;
      articleInfo.Properties.Author = metadata.author;
      articleInfo.Properties.Publisher = metadata.publisher;
      articleInfo.Properties.DatePublished = metadata.date;
      return resolve(metadata);
    })
  });
}