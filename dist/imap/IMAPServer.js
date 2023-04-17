import net from "net";
export default class IMAPServer {
    server;
    constructor(port) {
        this.server = net.createServer();
        this.server.listen(port, () => {
            console.log("[IMAP] Server listening on port " + port);
        });
        this.server.on("connection", this.connection);
    }
    connection(sock) {
        console.log("[IMAP] Client connected");
        sock.write("* OK IMAP4rev1 Service Ready\r\n");
        sock.on("data", async (data) => {
            const msg = data.toString();
            console.log("[IMAP] Received data: " + msg);
            const tag = msg.split(" ")[0];
            const rest = msg.split(" ").slice(1).join(" ");
            if (rest.startsWith("login")) {
                const username = rest.split(" ")[1];
                const password = rest.split(" ")[2];
            }
        });
        sock.addListener("close", () => {
            console.log("[IMAP] Client disconnected");
        });
    }
}
