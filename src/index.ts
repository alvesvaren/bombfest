import Koa from "koa";
import KoaRouter from "@koa/router";
import koaStatic from "koa-static";

const config = {
    port: 3000,
};

const app = new Koa();
const router = new KoaRouter();

router.get("/", (ctx, next) => {
    ctx.body = {online: true};
});

app.use(router.routes());
app.use(router.allowedMethods());

app.use(koaStatic("static"));

app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
});
