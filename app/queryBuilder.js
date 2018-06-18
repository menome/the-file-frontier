var Query = require('decypher').Query;

module.exports = {};

/** 
 * Takes an object with file metadata.
 * Returns CQL query that will build the object.
 * Doesn't link it to anything. Just creates the basic node with all its properties.
 */
module.exports.addFile = function(file, newUuid) {
  var query = new Query();

  query.merge("(f:File:Card {LibraryKey: $key, LibraryPath: $path})",{key: file.Library, path: file.Path});
  query.with("f, f.Uuid as olduuid, exists(f.Uuid) as ex");
  query.set("f += $params, f.Uuid = case ex when true then olduuid else $newUuid end", {params: file.params, newUuid: newUuid});
  query.return("f.Uuid as uuid");
  return query;
}

/**
 * Takes an object with article data
 *  Return cql query that builds the object
 * Doesn't link it to anything
 */
module.exports.addArticleQuery = function(articleObj, newUuid) {
  var query = new Query();

  var params = {
    Name: articleObj.Name,
    Uri: articleObj.Key,
    Description: articleObj.Properties.Description,
    ImageURL: articleObj.Properties.ImageURL,
    Author: articleObj.Properties.Author,
    DatePublished: articleObj.Properties.DatePublished,
    Publisher: articleObj.Properties.Publisher,
    FullText: articleObj.Properties.FullText,
    Uuid: newUuid
  };
  query.merge("(a:Card:Article {Uri: {uri}})",{uri: params.Uri});
  query.set("a += {params}", {params: params});
  return query;
}