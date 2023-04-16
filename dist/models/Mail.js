var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { DataTypes } from "sequelize";
import { AllowNull, BelongsTo, Column, ForeignKey, Model, PrimaryKey, Table, Unique } from "sequelize-typescript";
import User from "./User.js";
let Mail = class Mail extends Model {
};
__decorate([
    AllowNull(false),
    Unique,
    PrimaryKey,
    Column({
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4
    })
], Mail.prototype, "uuid", void 0);
__decorate([
    AllowNull(false),
    Column(DataTypes.STRING)
], Mail.prototype, "from", void 0);
__decorate([
    AllowNull(false),
    Column(DataTypes.STRING)
], Mail.prototype, "to", void 0);
__decorate([
    AllowNull(false),
    Column(DataTypes.STRING)
], Mail.prototype, "content", void 0);
__decorate([
    ForeignKey(() => User)
], Mail.prototype, "userUuid", void 0);
__decorate([
    BelongsTo(() => User)
], Mail.prototype, "user", void 0);
Mail = __decorate([
    Table({
        paranoid: true,
        tableName: "mails"
    })
], Mail);
export default Mail;
