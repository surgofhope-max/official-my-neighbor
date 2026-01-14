import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetStreamSession$ } from "../schemas/schemas_0";
export { $Command };
export class GetStreamSessionCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonInteractiveVideoService", "GetStreamSession", {})
    .n("IvsClient", "GetStreamSessionCommand")
    .sc(GetStreamSession$)
    .build() {
}
