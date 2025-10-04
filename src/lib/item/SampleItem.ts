import { GameRoom } from "../GameRoom";
import { Player } from "../player/Player";
import {Item} from "./Item";
import {TestGameRoom} from "../TestGameRoom";
import {MsgPayload} from "../Payload";

export class SampleItem extends Item<TestGameRoom> {
    protected ID: string;
    protected Name: string;
    protected Description: string;

    constructor() {
      super();
      this.ID = "sample-item"
      this.Name = "Sample Item"
      this.Description = "Sample Item Description"
    }

    protected onUse(user: Player, room: TestGameRoom): boolean {

      const currentAnswer = room.getCurrentAnswer()
      user.sendPayload(new MsgPayload({group: "server-response", name: "item-use", status: 0, data: {
        itemId: this.getId(),
          answer: currentAnswer,
        }}))

      user.getInventory().remove(this, 1)
      return true;

    }
}