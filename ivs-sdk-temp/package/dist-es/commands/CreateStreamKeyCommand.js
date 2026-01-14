import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { CreateStreamKey$ } from "../schemas/schemas_0";
export { $Command };
export class CreateStreamKeyCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "CreateStreamKey", {})
    .n("IvsClient", "CreateStreamKeyCommand")
    .sc(CreateStreamKey$)
    .build() {
}
