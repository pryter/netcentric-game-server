import {TestCoreGame} from "./test/TestCoreGame";
import {TestConnectionPool} from "./test/TestConnectionPool";
import serveStatic from "serve-static";
import * as http from "node:http";
import finalhandler from "finalhandler"


const game = new TestCoreGame()
const pool = new TestConnectionPool()
pool.setGlobalListener(game.globalListener)

const serve = serveStatic("./public");

const server = http.createServer(function(req, res) {
  const done = finalhandler(req, res);
  serve(req, res, done);
});

console.log("Test suite ui listening on port 8000 \nPlease open http://localhost:8000/")
server.listen(8000);

pool.startListening(8080)
