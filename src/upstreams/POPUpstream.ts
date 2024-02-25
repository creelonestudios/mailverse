import Logger from "../Logger.js"
import POP3Client from "../pop3/POP3Client.js"
import SMTP from "../smtp/SMTP.js"

type POPUpstreamOptions = {
	host: string;
	port: number;
	useTLS: boolean;
	username: string;
	password: string;
}

function sleep(ms: number) {
	return new Promise(resolve => {
		setTimeout(resolve, ms)
	})
}

const logger = new Logger("POP Upstream", "TEAL")

export default class POPUpstream {

	popclient: POP3Client | null; options: POPUpstreamOptions

	constructor(options: POPUpstreamOptions) {
		this.options = options
		this.popclient = null
	}

	async fetchNewEmails() {
		if (this.popclient === null) {
			this.popclient = new POP3Client(this.options.host, this.options.port, this.options.useTLS)
			await sleep(300)
			await this.popclient.login(this.options.username, this.options.password)
		}

		const mailIds = await this.popclient.list()

		if (mailIds.length === 0) return
		if (mailIds.length > 1) setTimeout(() => this.fetchNewEmails(), 1000)

		const content = await this.popclient.retrieveMail(mailIds[0])

		// Fetch the mail inside the <> brackets in the From: header
		let fromAddress = content.match(/^From: (.+?)\r\n/m)?.[1]
		let toAddress   = content.match(/^To: (.+?)\r\n/m)?.[1]

		fromAddress = fromAddress?.match(/<(.+?)>/)?.[1] || fromAddress
		toAddress   = toAddress?.match(/<(.+?)>/)?.[1]   || toAddress
		if (!fromAddress || !toAddress) throw new Error("Invalid email")

		await this.popclient.deleteMail(mailIds[0])

		if (toAddress.startsWith("*@")) {
			logger.log(`Mail is to upstream mail. Ignoring.`)

			return
		}

		SMTP.handleNewMail({ from: fromAddress, to: [toAddress], content })

		if (mailIds.length == 1) await this.popclient.logout()
	}

}
