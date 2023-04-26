export type EnhancedStatusSubject = {
	code: number,
	name: string
}

export interface StatusCode {
	code: number,
	message?: string,
	ok: boolean
}

export interface EnhancedStatusCode extends StatusCode {
	class: number,
	subject: number,
	detail: number
}

type EnhancedCode = `${bigint}.${bigint}.${bigint}`

const STATUS_SUBJECTS: Record<number, EnhancedStatusSubject> = [
	{ code: 0, name: "Other or Undefined" },
	{ code: 1, name: "Addressing" },
	{ code: 2, name: "Mailbox" },
	{ code: 3, name: "Mail System" },
	{ code: 4, name: "Network and Routing" },
	{ code: 5, name: "Mail Delivery" },
	{ code: 6, name: "Message Content or Media" },
	{ code: 7, name: "Security or Policy" }
]

let ok = true
const STATUS_CODES: Record<number, StatusCode> = {
	// OK
	211: { code: 211, ok }, // system status, or system help reply
	214: { code: 214, ok }, // help message (response to HELP command)
	220: { code: 220, ok, message: "% Service ready" },
	221: { code: 221, ok, message: "% Service closing transmission channel" },
	240: { code: 240, ok, message: "QUIT" },
	250: { code: 250, ok, message: "OK" }, // Requested mail action okay, completed
	251: { code: 251, ok, message: "User not local; will forward" },
	252: { code: 252, ok }, // Cannot verify the user, but it will try to deliver the message anyway
	// intermediate OK
	334: { code: 334, ok }, // base64-encoded server challenge
	354: { code: 354, ok, message: "Start mail input" },
	// transient NOT OK
	421: { code: 421, ok: false, message: "Service not available, closing transmission channel" },
	450: { code: 450, ok: false, message: "Requested mail action not taken: mailbox unavailable" }, // mailbox busy or temp. blocked
	451: { code: 451, ok, message: "Requested action aborted: local error in processing" },
	452: { code: 452, ok, message: "Requested action not taken: insufficient system storage" },
	455: { code: 455, ok, message: "Server unable to accommodate parameters" },
	// permanent NOT OK
	500: { code: 500, ok, message: "Syntax error, command unrecognized" },
	501: { code: 501, ok, message: "Syntax error in parameters or arguments" },
	502: { code: 502, ok, message: "Command not implemented" },
	503: { code: 503, ok, message: "Bad sequence of commands" },
	504: { code: 504, ok, message: "Command parameter is not implemented" },
	521: { code: 521, ok, message: "Server does not accept mail" },
	523: { code: 523, ok, message: "Encryption Needed" },
	550: { code: 550, ok, message: "Requested action not taken: mailbox unavailable" },
	551: { code: 551, ok, message: "User not local; please try %" },
	552: { code: 552, ok, message: "Requested mail action aborted: exceeded storage allocation" },
	553: { code: 553, ok, message: "Requested action not taken: mailbox name not allowed" },
	554: { code: 554, ok, message: "Transaction has failed" },
	556: { code: 556, ok, message: "Domain does not accept mail" }
}

const ENHANCED_STATUS_CODES: Record<`${number} ${EnhancedCode}`, EnhancedStatusCode> = {
	"221 2.0.0":  { code: 221, ok, message: "Goodbye",                                  class: 2, subject: 0, detail: 0 },
	"235 2.7.0":  { code: 235, ok, message: "Authentication succeeded",                 class: 2, subject: 7, detail: 0 },
	"432 4.7.12": { code: 432, ok, message: "A password transition is needed",          class: 4, subject: 7, detail: 12 },
	"451 4.4.1":  { code: 451, ok, message: "IMAP server unavailable",                  class: 4, subject: 4, detail: 1 },
	"454 4.7.0":  { code: 454, ok, message: "Temporary authentication failure",         class: 4, subject: 7, detail: 0 },
	"500 5.5.6":  { code: 500, ok, message: "Authentication Exchange line is too long", class: 5, subject: 5, detail: 6 },
	"501 5.5.2":  { code: 501, ok, message: "Cannot Base64-decode Client responses",    class: 5, subject: 5, detail: 2 },
	"501 5.7.0":  { code: 501, ok, message: "Client initiated Authentication Exchange", class: 5, subject: 7, detail: 0 },
	"504 5.5.4":  { code: 504, ok, message: "Unrecognized authentication type",         class: 5, subject: 5, detail: 4 },
	"530 5.7.0":  { code: 530, ok, message: "Authentication required",                  class: 5, subject: 7, detail: 0 },
	"534 5.7.9":  { code: 534, ok, message: "Authentication mechanism is too weak",     class: 5, subject: 7, detail: 9 },
	"535 5.7.8":  { code: 534, ok, message: "Authentication credentials invalid",       class: 5, subject: 7, detail: 8 },
	"538 5.7.11": { code: 538, ok, message: "Encryption required for requested authentication mechanism", class: 5, subject: 7, detail: 11 },
	"554 5.3.4":  { code: 554, ok, message: "Message too big for system",               class: 5, subject: 7, detail: 8 }
}

type StatusOptions = {
	message?: string,
	enhancedCode?: EnhancedCode,
	args?: string[]
}

export default function status(code: number, options?: StatusOptions | EnhancedCode) {
	if (typeof options == "string") options = { enhancedCode: options }
	if (!(code in STATUS_CODES)) return `${code} ${options?.message}\r\n`
	let statusCode = STATUS_CODES[code]
	let enhanced = false

	if (options && options.enhancedCode) {
		if (`${code} ${options.enhancedCode}` in ENHANCED_STATUS_CODES) {
			statusCode = ENHANCED_STATUS_CODES[`${code} ${options.enhancedCode}`]
			enhanced = true
		}
	}

	let message: string
	if (statusCode.message?.includes("%") && options?.args) message = replaceArgs(statusCode, options.args, options?.message)
	else message = options?.message || statusCode.message || ""

	if (enhanced) {
		const esc = statusCode as EnhancedStatusCode
		return `${esc.code} ${esc.class}.${esc.subject}.${esc.detail} ${message}\r\n`
	}

	return `${statusCode.code} ${message}\r\n`
}

function replaceArgs(statusCode: StatusCode, args: string[], msg?: string): string {
	if (!("message" in statusCode)) return msg || ""

	let message = statusCode.message as string
	for (let i = 0; message.includes("%"); i++) {
		message.replace("%", args[i] ?? msg)
	}

	return message
}
