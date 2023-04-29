/// <reference types="node" resolution-mode="require"/>
/// <reference types="node" resolution-mode="require"/>
import net from "net";
export default class SMTPServer {
    server: net.Server;
    useTLS: boolean;
    constructor(port: number, useTLS: boolean, key?: Buffer, cert?: Buffer);
    connection(sock: net.Socket): void;
}
