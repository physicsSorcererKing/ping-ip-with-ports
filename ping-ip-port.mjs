import {readFileSync} from 'node:fs'
import http from 'node:http'
import https from 'node:https'

const PING_TIMEOUT = 10000
const PING_INTERVAL = 2000

const main = async () => {
  const filePaths = process.argv.splice(2)
  console.log('import files:', ...filePaths)

  if(filePaths.length === 0) {
    console.warn("Usage: node ping-ip-port.mjs file1.csv file2.csv [...]")
    return 1
  }

  // read every csv files and turn to [ip, port] array
  const ipPortArr = filePaths.flatMap( path => {
    const data = readFileSync(path, 'utf8')
    // split by line breaks
    const rows = data.split(/\r?\n/)
    // parse to ips and their ports
    return rows.flatMap( row => {
      if(!row) return []

      const arr = row.split(',')
      const ip = arr[0]
      const ports = arr.slice(1).flatMap( port => {
        // ignore empty cell
        if (!port) return []
        // deal with port range
        if (port.includes('-')) {
          const [start, end] = port.split('-').map(Number)
          const everyPorts = []
          for (let i = start; i <= end; ++i) {
            everyPorts.push(i)
          }
          return everyPorts
        }
        
        return parseInt(port , 10)
      })
      // remove duplicated ports
      const clearPorts = [...new Set(ports)]

      return clearPorts.map(port => [ip, port])
    })
  })

  const promisesToBeCalled = ipPortArr.map(([ip, port]) => () => new Promise((resolve, reject) => {
    const options = {
      hostname: ip,
      port,
      method: 'GET',
      timeout: PING_TIMEOUT
    }
    const protocol = port === 443 ? https : http
    const ipPortStr = `${ip}:${port}`

    const request = protocol.request(options, res => {
      resolve(`${ipPortStr} is open. Status Code: ${res.statusCode}`);
    });

    request.on('timeout', () => {
      request.destroy();
      reject(`${ipPortStr} is unreachable (timeout).`);
    });

    request.on('error', err => {
      request.destroy();
      reject(`${ipPortStr} is closed or unreachable. Error: ${err.message}`);
    });

    request.end();
  })
  .then(info => console.log(info))
  .catch(errMsg => console.warn(errMsg)))

  let returnValue = 0;

  // forEach can't await promise
  for (let promiseTobeCalled of promisesToBeCalled) {
    await promiseTobeCalled().catch(() => { returnValue = 2 }).finally(async () => {
      await new Promise(res => setTimeout(res, PING_INTERVAL))
    })
  }

  return returnValue
}

main()