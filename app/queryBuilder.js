var Query = require('decypher').Query;

module.exports = {
  addFile
}

/** 
 * Takes an object with file metadata.
 * Returns CQL query that will build the object.
 * Doesn't link it to anything. Just creates the basic node with all its properties.
 */
function addFile(file, newUuid) {
  var query = new Query();

  query.merge("(f:File:Card {LibraryKey: $key, LibraryPath: $path})",{key: file.Library, path: file.Path});
  query.with("f, f.Uuid as olduuid, exists(f.Uuid) as ex");
  query.set("f += $params, f.Uuid = case ex when true then olduuid else $newUuid end", {params: file.params, newUuid: newUuid});
  query.return("f.Uuid as uuid");
  return query;
}