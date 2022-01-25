'use strict';
//https://github.com/pedroslopez/whatsapp-web.js/blob/master/src/util/Injected.js
/*
  Modified
    -ADD TAG MODULE - 27 MAR - 2020

*/
// Exposes the internal Store to the WhatsApp Web client
exports.WindowStore = (moduleRaidStr) => {
  eval('var moduleRaid = ' + moduleRaidStr);
  // eslint-disable-next-line no-undef
  window.mR = moduleRaid();
  window.Store = window.mR.findModule('Chat')[1].default;
  window.Store.AppState = window.mR.findModule('STREAM')[0].default;
  window.Store.Conn = window.mR.findModule('Conn')[0].default;
  window.Store.CryptoLib = window.mR.findModule('decryptE2EMedia')[0];
  window.Store.Wap = window.mR.findModule('Wap')[0].default;
  window.Store.SendSeen = window.mR.findModule('sendSeen')[0];
  window.Store.SendClear = window.mR.findModule('sendClear')[0];
  window.Store.SendDelete = window.mR.findModule('sendDelete')[0];
  window.Store.genId = window.mR.findModule((module) => module.default && typeof module.default === 'function' && module.default.toString().match(/crypto/))[0].default;
  window.Store.SendMessage = window.mR.findModule('addAndSendMsgToChat')[0];
  window.Store.MsgKey = window.mR.findModule((module) => module.default && module.default.fromString)[0].default;
  window.Store.Invite = window.mR.findModule('sendJoinGroupViaInvite')[0];
  window.Store.OpaqueData = window.mR.findModule('getOrCreateOpaqueDataForPath')[0];
  window.Store.MediaPrep = window.mR.findModule('MediaPrep')[0];
  window.Store.MediaObject = window.mR.findModule('getOrCreateMediaObject')[0];
  window.Store.MediaUpload = window.mR.findModule('uploadMedia')[0];
  window.Store.Cmd = window.mR.findModule('Cmd')[0].default;
  window.Store.tag = window.mR.findModule('tag')[0].default;
  window.Store.MediaTypes = window.mR.findModule('msgToMediaType')[0];
  window.Store.UserConstructor = window.mR.findModule((module) => (module.default && module.default.prototype && module.default.prototype.isServer && module.default.prototype.isUser) ? module.default : null)[0].default;
  window.Store.Validators = window.mR.findModule('findLinks')[0];
};

exports.WindowUtils = () => {
  window.App = {};
  window.App.getNumberId = async (id) => {
    let result = await window.Store.Wap.queryExist(id);
    if(result.jid === undefined)
      throw 'The number provided is not a registered whatsapp user';
    return result.jid;
  };

  window.App.sendSeen = async (chatId) => {
    let chat = window.Store.Chat.get(chatId);
    if(chat !== undefined){
      await window.Store.SendSeen.sendSeen(chat, false);
      return true;
    }
    return false;
  };


  window.App.sendMessage = async (chat, content, options = {}) => {
      let attOptions = {};
      if (options.attachment) {
          attOptions = await window.App.processMediaData(options.attachment, options.sendAudioAsVoice);
          delete options.attachment;
      }

      let quotedMsgOptions = {};
      if (options.quotedMessageId) {
          let quotedMessage = window.Store.Msg.get(options.quotedMessageId);
          if (quotedMessage.canReply()) {
              quotedMsgOptions = quotedMessage.msgContextInfo(chat);
          }
          delete options.quotedMessageId;
      }

      if (options.mentionedJidList) {
          options.mentionedJidList = options.mentionedJidList.map(cId => window.Store.Contact.get(cId).id);
      }

      let locationOptions = {};
      if (options.location) {
          locationOptions = {
              type: 'location',
              loc: options.location.name,
              lat: options.location.latitude,
              lng: options.location.longitude
          };
          delete options.location;
      }

      if (options.preview) {
          delete options.preview;
          const link = window.Store.Validators.findLink(content);
          if (link) {
              const preview = await window.Store.Wap.queryLinkPreview(link.url);
              preview.preview = true;
              preview.subtype = 'url';
              options = { ...options, ...preview };
          }
      }

      const newMsgId = new window.Store.MsgKey({
          from: window.Store.Conn.me,
          to: chat.id,
          id: window.Store.genId(),
      });

      const message = {
          ...options,
          id: newMsgId,
          ack: 0,
          body: content,
          from: window.Store.Conn.me,
          to: chat.id,
          local: true,
          self: 'out',
          t: parseInt(new Date().getTime() / 1000),
          isNewMsg: true,
          type: 'chat',
          ...locationOptions,
          ...attOptions,
          ...quotedMsgOptions
      };

      await window.Store.SendMessage.addAndSendMsgToChat(chat, message);
      return window.Store.Msg.get(newMsgId._serialized);
  };

  window.App.processMediaData = async (mediaInfo) => {
    const file = window.App.mediaInfoToFile(mediaInfo);
    const mData = await window.Store.OpaqueData.default.createFromData(file, file.type);
    const mediaPrep = window.Store.MediaPrep.prepRawMedia(mData, {});
    const mediaData = await mediaPrep.waitForPrep();
    const mediaObject = window.Store.MediaObject.getOrCreateMediaObject(mediaData.filehash);

    const mediaType = window.Store.MediaTypes.msgToMediaType({
       type: mediaData.type,
       isGif: mediaData.isGif
    });

    if(forceVoice && mediaData.type === 'audio') {
       mediaData.type = 'ptt';
    }

    if (!(mediaData.mediaBlob instanceof window.Store.OpaqueData.default)) {
       mediaData.mediaBlob = await window.Store.OpaqueData.default.createFromData(mediaData.mediaBlob, mediaData.mediaBlob.type);
    }

    mediaData.renderableUrl = mediaData.mediaBlob.url();
    mediaObject.consolidate(mediaData.toJSON());
    mediaData.mediaBlob.autorelease();

    const uploadedMedia = await window.Store.MediaUpload.uploadMedia({ mimetype: mediaData.mimetype, mediaObject, mediaType });
    if (!uploadedMedia) {
       throw new Error('upload failed: media entry was not created');
    }

    mediaData.set({
       clientUrl: uploadedMedia.mmsUrl,
       directPath: uploadedMedia.directPath,
       mediaKey: uploadedMedia.mediaKey,
       mediaKeyTimestamp: uploadedMedia.mediaKeyTimestamp,
       filehash: mediaObject.filehash,
       uploadhash: uploadedMedia.uploadHash,
       size: mediaObject.size,
       streamingSidecar: uploadedMedia.sidecar,
       firstFrameSidecar: uploadedMedia.firstFrameSidecar
    });

    return mediaData;
  };

  window.App.getChatModel = chat => {
    let res = chat.serialize();
    res.isGroup = chat.isGroup;
    res.formattedTitle = chat.formattedTitle;

    if(chat.groupMetadata){
      res.groupMetadata = chat.groupMetadata.serialize();
    }

    return res;
  };

  window.App.getChat = chatId => {
    const chat = window.Store.Chat.get(chatId);
    return window.App.getChatModel(chat);
  };

  window.App.getChats = () => {
    const chats = window.Store.Chat.models;
    return chats.map(chat => window.App.getChatModel(chat));
  };

  window.App.getContactModel = contact => {
    let res = contact.serialize();
    res.isBusiness = contact.isBusiness;

    if(contact.businessProfile){
      res.businessProfile = contact.businessProfile.serialize();
    }

    res.isMe = contact.isMe;
    res.isUser = contact.isUser;
    res.isGroup = contact.isGroup;
    res.isWAContact = contact.isWAContact;
    res.isMyContact = contact.isMyContact;
    res.userid = contact.userid;

    return res;
  };

  window.App.getContact = contactId => {
    const contact = window.Store.Contact.get(contactId);
    return window.App.getContactModel(contact);
  };

  window.App.getContacts = () => {
    const contacts = window.Store.Contact.models;
    return contacts.map(contact => window.App.getContactModel(contact));
  };

  window.App.mediaInfoToFile = ({ data, mimetype, filename }) => {
    const binaryData = atob(data);
    const buffer = new ArrayBuffer(binaryData.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binaryData.length; i++){
      view[i] = binaryData.charCodeAt(i);
    }
    const blob = new Blob([buffer], { type: mimetype });
    return new File([blob], filename, {
      type: mimetype,
      lastModified: Date.now()
    });
  };

  window.App.downloadBuffer = (url) => {
    return new Promise(function (resolve, reject){
      let xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'arraybuffer';
      xhr.onload = function(){
        if(xhr.status == 200){
          resolve(xhr.response);
        }else{
          reject({
            status: this.status,
            statusText: xhr.statusText
          });
        }
      };
      xhr.onerror = function(){
        reject({
          status: this.status,
          statusText: xhr.statusText
        });
      };
      xhr.send(null);
    });
  };

  window.App.readBlobAsync = (blob) => {
    return new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  window.App.sendClearChat = async (chatId) => {
    let chat = window.Store.Chat.get(chatId);
    if(chat !== undefined){
      await window.Store.SendClear.sendClear(chat, false);
      return true;
    }
    return false;
  };

  window.App.sendDeleteChat = async (chatId) => {
    let chat = window.Store.Chat.get(chatId);
    if(chat !== undefined){
      await window.Store.SendDelete.sendDelete(chat);
      return true;
    }
    return false;
  };

  window.App.sendChatstate = async (state, chatId) => {
    switch(state){
    case 'typing':
      await window.Store.Wap.sendChatstateComposing(chatId);
    break;
    case 'recording':
      await window.Store.Wap.sendChatstateRecording(chatId);
    break;
    case 'stop':
      await window.Store.Wap.sendChatstatePaused(chatId);
      break;
    default:
      throw 'Invalid chatstate';
    }
    return true;
  };
};
