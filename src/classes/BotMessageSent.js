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
class BotMessageSent{
	save(){
		return JSON.stringify([this.message, this.type, this._q]);
	}

	load(json, user){
		this.chat_id = user.id;
		// json = JSON.parse(json);
		json.forEach(value => {
			var method  = value[0],
				args    = [],
				key;
			for(key in value[1]){
				args.push(value[1][key]);
			}
			this[method](...args);
		});
	}

	_load(message){
		this.message        = message;
		this.id             = message.message_id;
		this.from           = message.from ? new User(message.from) : undefined;
		this.chat           = message.chat instanceof User ? message.chat : new User(message.chat);
		this.forward_from   = message.forward_from ? new User(message.forward_from) : undefined;
	}

	constructor(message, type, chat_id){
		this._q = [];
		this._load(message);
		this.type       = type;
		this.chat_id    = chat_id;
	}

	editCaption(newCaption, options){
		this._q.push(['editCaption', arguments]);
		options = options || {};
		if(this.message.reply_markup)
			options.reply_markup = this.message.reply_markup;
		return new Promise((resolve) => {
			global.TgBotApi.editMessageCaption(newCaption, options, {
				chat_id     : this.chat_id,
				message_id  : this.id
			}).then((msg) => {
				this._load(msg);
				resolve(this);
			})
		});
	}

	editText(newText, options){
		this._q.push(['editText', arguments]);
		options = options || {};
		if(newText == this.message.text)
			return;
		return new Promise((resolve) => {
			options.chat_id = this.chat_id;
			options.message_id = this.id;
			global.TgBotApi.editMessageText(newText, options).then((msg) => {
				this._load(msg);
				global.RedisClient.hset(':u' + this.chat_id, ':lastmsg', JSON.stringify({
					id: this.id,
					type: this.type,
					text: newText
				}));
				resolve(this);
			})
		});
	}

	editReplyMarkup(reply_markup){
		this._q.push(['editReplyMarkup', arguments]);
		return new Promise((resolve) => {
			global.TgBotApi.editMessageReplyMarkup(reply_markup, {
				chat_id     : this.chat_id,
				message_id  : this.id
			}).then((msg) => {
				this._load(msg);
				resolve(this);
			})
		})
	}
}