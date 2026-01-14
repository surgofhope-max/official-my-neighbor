import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { DeleteStreamKey$ } from "../schemas/schemas_0";
export { $Command };
export class DeleteStreamKeyCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "DeleteStreamKey", {})
    .n("IvsClient", "DeleteStreamKeyCommand")
    .sc(DeleteStreamKey$)
    .build() {
}
