import { JurisprudenciaVersion } from "@stjiris/jurisprudencia-document";
import { updateDrives } from "./sharepoint.js";
import { client } from "../juris.js";

const FLAG_HELP = process.argv.some((arg) => arg === "-h" || arg === "--help");

function showHelp(code: number, error?: string) {
    if (error) {
        process.stderr.write(`Error: ${error}\n\n`);
    }
    process.stdout.write(`Usage: ${process.argv0} ${__filename} [OPTIONS]\n`);

    process.stdout.write(`Populate Jurisprudencia index. (${JurisprudenciaVersion})\n`);
    process.stdout.write(`Use ES_URL, ES_USER and ES_PASS environment variables to setup the elasticsearch client\n`);
    process.stdout.write(`Options:\n`);
    process.stdout.write(`\t--help, -h\tshow this help\n`);
    process.exit(code);
}

async function main() {
    if (FLAG_HELP) return showHelp(0);
    let existsR = await client.indices.exists({ index: JurisprudenciaVersion }, { ignore: [404] });
    if (!existsR) {
        // On a fresh deployment the new index may not exist yet (it's created by
        // a separate step that owns its schema). Skip this run gracefully and
        // exit 0 instead of failing, so the cron keeps retrying and starts
        // working automatically once the index has been created.
        console.log(`${JurisprudenciaVersion} not found yet — skipping this run, will retry next cron.`);
        return;
    }
    try {
        await updateDrives();
    } catch (err: unknown) {
        const error = err as any;
        const msg = error?.message || error?.body || String(err);
        
        if (msg.includes("AADSTS7000222") || msg.includes("expired") || error?.code === "AuthenticationRequiredError") {
            console.error(`\n[ERRO CRÍTICO - SHAREPOINT ETL] Falha de Autenticação no Azure AD:`);
            console.error(`O Client Secret da aplicação expirou (AADSTS7000222).`);
            console.error(`É necessário gerar um novo Client Secret no portal Azure e atualizar a variável CLIENT_SECRET.\n`);
        } else {
            console.error(`\n[ERRO - SHAREPOINT ETL] Ocorreu uma exceção durante a execução do ETL:`);
        }
        throw err;
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
