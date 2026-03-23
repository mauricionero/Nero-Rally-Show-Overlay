export default class WsMessageReceiver {
  constructor(onMessage) {
    this.onMessage = onMessage;
  }

  handleMessage(data) {
    if (!data) return;
    this.onMessage?.(data);
  }
}
