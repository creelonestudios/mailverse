var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { DataTypes } from "sequelize";
import { AllowNull, Column, HasMany, Model, PrimaryKey, Table, Unique } from "sequelize-typescript";
import Mail from "./Mail.js";
import { createHash } from "node:crypto";
let User = class User extends Model {
    async getMail(id) {
        const mails = await this.$get("mails");
        if (!mails)
            return undefined;
        return mails.find(mail => mail.id == id);
    }
};
__decorate([
    AllowNull(false),
    Unique,
    Column(DataTypes.STRING)
], User.prototype, "name", void 0);
__decorate([
    AllowNull(false),
    Unique,
    PrimaryKey,
    Column(DataTypes.STRING)
], User.prototype, "username", void 0);
__decorate([
    AllowNull(false),
    Column({
        type: DataTypes.STRING,
        set(value) {
            const hash = createHash("sha256");
            hash.update(String(value));
            this.setDataValue("password", hash.digest("hex"));
        }
    })
], User.prototype, "password", void 0);
__decorate([
    HasMany(() => Mail)
], User.prototype, "mails", void 0);
User = __decorate([
    Table({
        paranoid: true,
        tableName: "users"
    })
], User);
export default User;
