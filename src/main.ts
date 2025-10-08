import {ConnectionPool} from "@lib/ConnectionPool";
import {CoreGame} from "@lib/CoreGame";


const pool = new ConnectionPool()
const cg = new CoreGame()

pool.setGlobalListener(cg.globalListener)
pool.startListening(8080)