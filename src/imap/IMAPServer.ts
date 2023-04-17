import net from "net"
import { readdirSync, readFileSync } from "fs"
import { createHash } from "node:crypto"
import User from "../models/User.js"

export default class IMAPServer {

  server: net.Server

  constructor(port: number) {
    this.server = net.createServer()
    this.server.listen(port, () => {
      console.log("[IMAP] Server listening on port " + port)
    })
    this.server.on("connection", this.connection)
  }

  connection(sock: net.Socket) {
    console.log("[IMAP] Client connected")
    sock.write("* OK IMAP4rev1 Service Ready\r\n")
    let user: User;
    sock.on("data", async (data: Buffer) => {
      const msg = data.toString()
      console.log("[IMAP] Received data: " + msg)
      const tag = msg.split(" ")[0]
      const rest = msg.split(" ").slice(1).join(" ")
      if(rest.startsWith("login")) {
        const username = rest.split(" ")[1]
        let _user = await User.findOne({ where: { username: username } })
        if(!_user) {
          sock.write(tag + " NO Invalid username or password\r\n")
          return
        }
        user = _user

        const password = rest.split(" ")[2]
        const hash = createHash("sha256")
        hash.update(password)
        const hashedPassword = hash.digest("hex")
        if(user.password == hashedPassword) {
          sock.write(tag + " OK Logged in\r\n")
        }
      } else if(rest.startsWith("select")) {
        const mailbox = rest.split(" ")[1]
        if(mailbox == "INBOX") {
          sock.write("* 18 EXISTS\r");
          sock.write("* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r");
          sock.write("* 2 RECENT");
          sock.write("* OK [UNSEEN 1] Message 1 is the first unseen message\r");
          sock.write("* OK [UIDVALIDITY 1] UIDs valid\r");
          sock.write(tag + " OK [READ-WRITE] SELECT completed\r");
        } else {
          sock.write(tag + " NO [NONEXISTENT] SELECT failed\r")
        }
      } else if(rest.startsWith("fetch")) {
        // fetch 1 body[...]
        const id = rest.split(" ")[1] // 1
        const body = rest.split(" ")[2] // body[...]
        const mails = await user.$get("mails")
        const mail = mails[parseInt(id) - 1]
        if(!mail) {
          sock.write(tag + " NO [NONEXISTENT] FETCH failed\r")
          return
        }
        if(body == "body[]") {
          sock.write("* 1 FETCH (BODY[] {" + mail.content.length + "}\r")
          sock.write(mail.content + ")\r")
          sock.write(tag + " OK FETCH completed\r")
        }
      } else if(rest.startsWith("logout")) {
        sock.write("* BYE IMAP4rev1 Server logging out\r")
        sock.write(tag + " OK LOGOUT completed\r")
        sock.end()
      }
    })
    sock.addListener("close", () => {
      console.log("[IMAP] Client disconnected")
    })
  }

}