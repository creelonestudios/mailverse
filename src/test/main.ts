import Logger from "../Logger.js"
import { status } from "../smtp/status.js"

const ESC = "\u001b"
const RED   = ESC + "[91m"
const YELLOW = ESC + "[93m"
const BLUE  = ESC + "[94m"
const GREEN = ESC + "[92m"

let errors = 0

const logger = new Logger("test", "TEAL")
logger.debug("debug log")
logger.log("info log")
logger.warn("warning log")
logger.error("error log")

const smtpStatusTestCases: [number | `${number} ${bigint}.${bigint}.${bigint}`, string][] = [
	[451, "451 Requested action aborted: local error in processing\r\n"],
	[521, "521 Server does not accept mail\r\n"],
	[550, "550 Requested action not taken: mailbox unavailable\r\n"],
	["530 5.7.0", "530 5.7.0 Authentication required\r\n"],
	["538 5.7.11", "538 5.7.11 Encryption required for requested authentication mechanism\r\n"]
]

for (let e of smtpStatusTestCases) {
	const args = (e[0]+"").split(" ") as [number, `${bigint}.${bigint}.${bigint}` | undefined]
	const statusMsg = status(Number(args[0]), args[1])
	logger.log(`SMTP ${e[0]}: [${statusMsg.substring(0, statusMsg.length-2)}]`)
	if (statusMsg != e[1]) {
		errors++
		logger.error(`SMTP ${e[0]} does not match test case`)
	}
}

const totalCases = smtpStatusTestCases.length
const errorColor = errors ? RED : GREEN
logger.log(`${BLUE}------------------------------------------------`)
logger.log(`${BLUE}Test cases completed: ${errorColor}${errors}${BLUE} out of ${YELLOW}${totalCases}${BLUE} failed`)

process.exit(errors ? 1 : 0)
