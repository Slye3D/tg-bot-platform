/*****************************************************************************
 *   This program is free software: you can redistribute it and/or modify    *
 *   it under the terms of the GNU General Public License as published by    *
 *   the Free Software Foundation, either version 3 of the License, or       *
 *   (at your option) any later version.                                     *
 *___________________________________________________________________________*
 *   This program is distributed in the hope that it will be useful,         *
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of          *
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the           *
 *   GNU General Public License for more details.                            *
 *___________________________________________________________________________*
 *   You should have received a copy of the GNU General Public License       *
 *   along with this program.  If not, see <http://www.gnu.org/licenses/>.   *
 *___________________________________________________________________________*
 *                             Created by  Qti3e                             *
 *        <http://Qti3e.Github.io>    LO-VE    <Qti3eQti3e@Gmail.com>        *
 *****************************************************************************/

// Load main dependencies
const TelegramBot   = require('node-telegram-bot-api'),
	redis           = require("redis");

// Set some global vars
// Note: because of this problem you won't be able to run more than one bot in each JS file.
global.RedisClient      = redis.createClient();
global.TgBotApi         = undefined;

// Include classes
module.exports = {
	BotMessage: BotMessage,
	Bot: Bot,
	User: User,
	Pug: TemplateEngine
};
