/// <reference types="node" resolution-mode="require"/>
import net from "net";
export default class IMAPServer {
    server: net.Server;
    constructor(port: number);
    connection(sock: net.Socket): void;
}
