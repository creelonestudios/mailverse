import net from "net";
import { writeFileSync, mkdirSync } from "fs";
import getConfig from "../config.js";
import User from "../models/User.js";
import { smtpserver } from "../main.js";
import crypto from "node:crypto";
import status from "./status.js";
export default class SMTPServer {
    server;
    constructor(port) {
        this.server = net.createServer();
        this.server.listen(port, () => {
            console.log("[SMTP] Server listening on port " + port);
        });
        this.server.on("connection", this.connection);
    }
    connection(sock) {
        console.log("[SMTP] Client connected");
        sock.write(status(220, { message: getConfig("smtp_header", "SMTP Server ready") }));
        let receivingData = false;
        let info = {
            from: "",
            to: [],
            content: ""
        };
        sock.on("data", async (data) => {
            const msg = data.toString();
            // TODO implement regular HELO greeting
            if (receivingData) {
                console.log("[SMTP] Received message content: " + msg);
                info.content += msg;
                if (msg.endsWith(".\r\n")) {
                    receivingData = false;
                    info.content = info.content.substring(0, info.content.length - 3).replaceAll("\r\n", "\n");
                    await smtpserver.handleNewMail(info);
                    sock.write(status(250));
                    console.log("[SMTP] No longer receiving data -----------------------------------");
                    return;
                }
                return;
            }
            console.log("[SMTP] Received data: " + msg);
            if (msg.startsWith("EHLO")) {
                sock.write("250-localhost\r\n");
                // We dont have any smtp extensions yet
                sock.write(status(250, { message: "HELP" })); // was: 250 HELP
            }
            else if (msg.startsWith("MAIL FROM:")) {
                const email = msg.split(":")[1].split(">")[0].replace("<", "");
                console.log("[SMTP] MAIL FROM: " + email);
                info.from = email;
                sock.write(status(250));
            }
            else if (msg.startsWith("RCPT TO:")) {
                const email = msg.split(":")[1].split(">")[0].replace("<", "");
                info.to.push(email);
                console.log("[SMTP] RCPT TO: " + email);
                sock.write(status(250));
            }
            else if (msg.startsWith("DATA")) {
                receivingData = true;
                console.log("[SMTP] Now receiving data -----------------------------------");
                sock.write(status(354));
            }
            else if (msg.startsWith("QUIT")) {
                sock.write(status(221, "2.0.0"));
                sock.end();
            }
            else {
                sock.write(status(502));
            }
        });
        sock.on("close", () => {
            console.log("[SMTP] Client disconnected");
        });
    }
    async handleNewMail(info) {
        const id = crypto.randomUUID();
        mkdirSync(`mails/`, { recursive: true });
        writeFileSync(`mails/${id}.txt`, info.content);
        console.log("[SMTP] Saved mail to " + `mails/${id}.txt`);
        const serverName = getConfig("host");
        if (info.from.endsWith("@" + serverName)) {
            console.log("[SMTP] Mail is from this server.");
            if (info.to.every(email => email.endsWith("@" + serverName))) { // if all recipients are on this server
                console.log("[SMTP] All recipients are on this server.");
                // TODO: add mail to mailboxes
                return;
            }
            console.log("[SMTP] Not all recipients are on this server. Will forward mail to other servers.");
            console.error("[SMTP] Forwarding mails to other servers is not implemented yet.");
            return;
        }
        // Mail is not from this server
        if (!info.to.every(email => email.endsWith("@" + serverName))) {
            console.error("[SMTP] Not all recipients are from this server. Will NOT forward mail to other servers.");
        }
        const recipients = info.to.filter(email => email.endsWith("@" + serverName));
        for (const rec of recipients) {
            console.log("[SMTP] Forwarding mail to " + rec);
            const user = await User.findOne({ where: { username: rec.split("@")[0] } });
            if (!user) {
                console.error("[SMTP] User " + rec + " does not exist.");
                continue;
            }
            await user.$create("mail", {
                from: info.from,
                to: rec,
                content: id
            });
            console.log("[SMTP] Forwarded mail to " + rec);
        }
    }
}
