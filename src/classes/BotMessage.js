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

/**
 * Use this class to send messages to users :)
 * Example:
 *  new BotMessage('video', '/file.mp4').send(user).then((msg) => {
 *      msg.editCaption('Edited Caption');
 *  });
 */
class BotMessage {
	save(){
		return JSON.stringify([
			this.type,
			this._data
		])
	}
	load(json){
		var r = JSON.parse(json)
		this.type = r[0]
		this._data = r[1];
	}

	/**
	 * Set all initial values and get all of required arguments based on message type
	 * @param type
	 */
	constructor(type){
		type            = type || 'text';
		this.type       = type;
		this._data      = {};

		switch(type){
			case 'text':
				this._data['text']      = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'photo':
				this._data['photo']     = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'document':
				this._data['doc']       = arguments[1];
				this._data['options']   = arguments[2] || {};
				this._data['fOptions']  = arguments[3] || {};
				break;
			case 'audio':
				this._data['audio']     = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'sticker':
				this._data['sticker']   = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'voice':
				this._data['voice']     = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'video':
				this._data['video']     = arguments[1];
				this._data['options']   = arguments[2] || {};
				break;
			case 'location':
				this._data['latitude']  = arguments[1];
				this._data['longitude'] = arguments[2];
				this._data['options']   = arguments[3] || {};
				break;
			case 'venue':
				this._data['latitude']  = arguments[1];
				this._data['longitude'] = arguments[2];
				this._data['title']     = arguments[3];
				this._data['address']   = arguments[4];
				this._data['options']   = arguments[5] || {};
				break;
			case 'contact':
				this._data['number']    = arguments[1];
				this._data['firstName'] = arguments[2];
				this._data['options']   = arguments[3] || {};
				break;
		}
	}

	/**
	 * Send message to user
	 * @param user {User|number}
	 * @returns {Promise}
	 */
	send(user){
		var chat_id = user.id || user;

		return new Promise((resolve) => {
			var callback    = (msg) => {
				global.RedisClient.hset(':u' + chat_id, ':lastmsg', JSON.stringify({
					id: msg.message_id,
					type: this.type,
					text: this._data['text']
				}));
				var sent    = new BotMessageSent(msg, this.type, chat_id);
				resolve(sent);
			};
			const TgBotAPI = global.TgBotApi;
			switch(this.type){
				case 'text':
					TgBotAPI.sendMessage(chat_id, this._data['text'], this._data['options']).then(callback);
					break;
				case 'photo':
					TgBotAPI.sendPhoto(chat_id, this._data['photo'], this._data['options']).then(callback);
					break;
				case 'document':
					TgBotAPI.sendDocument(chat_id, this._data['doc'], this._data['options'], this._data['fOptions']).then(callback);
					break;
				case 'audio':
					TgBotAPI.sendAudio(chat_id, this._data['audio'], this._data['options']).then(callback);
					break;
				case 'sticker':
					TgBotAPI.sendSticker(chat_id, this._data['sticker'], this._data['options']).then(callback);
					break;
				case 'voice':
					TgBotAPI.sendVoice(chat_id, this._data['voice'], this._data['options']).then(callback);
					break;
				case 'video':
					TgBotAPI.sendVideo(chat_id, this._data['video'], this._data['options']).then(callback);
					break;
				case 'location':
					TgBotAPI.sendLocation(chat_id, this._data['latitude'], this._data['longitude'], this._data['options']).then(callback);
					break;
				case 'venue':
					TgBotAPI.sendVenue(chat_id, this._data['latitude'], this._data['longitude'], this._data['title'], this._data['address'], this._data['options']).then(callback);
					break;
				case 'contact':
					TgBotAPI.sendContact(chat_id, this._data['number'], this._data['firstName'], this._data['options']).then(callback);
					break;
			}
		});
	}

	caption(caption){
		if(this.type == 'text')
			return;
		this._data['options']['caption'] = caption;
	}

	replyMarkup(reply_markup){
		this._data['options']['reply_markup']   = reply_markup;
	}

	markdown(){
		this._data['options']['parse_mode'] = 'markdown';
	}

	html(){
		this._data['options']['parse_mode'] = 'html';
	}
	
	disablePreview(){
		this._data['options']['disable_web_page_preview'] = false;
	}
}
