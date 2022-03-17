import Koa from "koa";
import KoaRouter from "@koa/router";
import koaStatic from "koa-static";
import koaLogger from 'koa-logger';
import koaWs from 'koa-easy-ws';
import WebSocket from "ws";

const config = {
    port: 3000,
};

const app = new Koa();
const router = new KoaRouter();

router.get("/", (ctx, next) => {
    ctx.body = {online: true};
});

router.get('/ws', async (ctx, next) => {
    if (ctx.ws) {
        const ws: WebSocket = await ctx.ws();
        ws.on("message", msg => {
            console.log(msg);
        })
    }
})


app.use(koaLogger());
app.use(koaStatic("static"));
app.use(koaWs());
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
});
