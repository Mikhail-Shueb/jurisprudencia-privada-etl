import { parseFilename, extractProcessNumber } from "./filename-parser.js";

describe("parseFilename", () => {
    describe("Pattern A — underscore separator", () => {
        it("parses standalone sumário", () => {
            const r = parseFilename("507-25.7PEOER.L1.S1_Sumário.docx");
            expect(r.nrProcesso).toBe("507-25.7PEOER.L1.S1");
            expect(r.tipoDocumento).toBe("sumario");
            expect(r.hasEmbeddedSumario).toBe(false);
            expect(r.hasEmbeddedDescritores).toBe(false);
        });

        it("parses standalone acórdão", () => {
            const r = parseFilename("551-24.1JELSB.L1.S1_Acórdão.docx");
            expect(r.nrProcesso).toBe("551-24.1JELSB.L1.S1");
            expect(r.tipoDocumento).toBe("acordao");
            expect(r.hasEmbeddedSumario).toBe(false);
        });

        it("parses acórdão with embedded sumário (lowercase)", () => {
            const r = parseFilename("672-23.8TBLRA.L1.S1_Acórdão_sumário.docx");
            expect(r.nrProcesso).toBe("672-23.8TBLRA.L1.S1");
            expect(r.tipoDocumento).toBe("acordao_com_sumario");
            expect(r.hasEmbeddedSumario).toBe(true);
        });

        it("parses acórdão with embedded sumário (capitalized)", () => {
            const r = parseFilename("613-22.0T8AGH.L1.S2_Acórdão_Sumário.docx");
            expect(r.nrProcesso).toBe("613-22.0T8AGH.L1.S2");
            expect(r.tipoDocumento).toBe("acordao_com_sumario");
            expect(r.hasEmbeddedSumario).toBe(true);
        });

        it("parses acórdão with embedded sumário (another example)", () => {
            const r = parseFilename("276-23.5T8SSB.E1.S1_Acórdão_Sumário.docx");
            expect(r.nrProcesso).toBe("276-23.5T8SSB.E1.S1");
            expect(r.tipoDocumento).toBe("acordao_com_sumario");
            expect(r.hasEmbeddedSumario).toBe(true);
        });

        it("handles process number containing underscore", () => {
            const r = parseFilename("1114_25.0SJPRT.P1-A.S1_Acórdão.docx");
            expect(r.nrProcesso).toBe("1114_25.0SJPRT.P1-A.S1");
            expect(r.tipoDocumento).toBe("acordao");
        });

        it("handles process number containing underscore — sumário", () => {
            const r = parseFilename("1114_25.0SJPRT.P1-A.S1_Sumário.docx");
            expect(r.nrProcesso).toBe("1114_25.0SJPRT.P1-A.S1");
            expect(r.tipoDocumento).toBe("sumario");
        });
    });

    describe("Pattern B — space-dash separator", () => {
        it("parses acórdão with relator", () => {
            const r = parseFilename("749-22.7JABRG.G1.S1 - Acórdão - CCLobo.docx");
            expect(r.nrProcesso).toBe("749-22.7JABRG.G1.S1");
            expect(r.tipoDocumento).toBe("acordao");
            expect(r.relator).toBe("CCLobo");
        });

        it("parses another acórdão with relator", () => {
            const r = parseFilename("214-25.0JELSB.L1.S1 - Acórdão - CCLobo.docx");
            expect(r.nrProcesso).toBe("214-25.0JELSB.L1.S1");
            expect(r.tipoDocumento).toBe("acordao");
            expect(r.relator).toBe("CCLobo");
        });

        it("parses sumário with relator", () => {
            const r = parseFilename("152-19.6GFVNG-A.S1 - Sumário - CCLobo.docx");
            expect(r.nrProcesso).toBe("152-19.6GFVNG-A.S1");
            expect(r.tipoDocumento).toBe("sumario");
            expect(r.relator).toBe("CCLobo");
        });

        it("parses sumário with relator (another)", () => {
            const r = parseFilename("749-22.7JABRG.G1.S1 - Sumário - CCLobo.docx");
            expect(r.nrProcesso).toBe("749-22.7JABRG.G1.S1");
            expect(r.tipoDocumento).toBe("sumario");
            expect(r.relator).toBe("CCLobo");
        });
    });

    describe("Pattern C — plus-sign separator", () => {
        it("parses sumário with relator", () => {
            const r = parseFilename("1-26.9YFLSB+Sumário-ISalgado.docx");
            expect(r.nrProcesso).toBe("1-26.9YFLSB");
            expect(r.tipoDocumento).toBe("acordao_com_sumario");
            expect(r.hasEmbeddedSumario).toBe(true);
            expect(r.relator).toBe("ISalgado");
        });

        it("parses sumário with relator (short name)", () => {
            const r = parseFilename("3448-24.1T8PRTA.P1.S1+Sumário-MOG.docx");
            expect(r.nrProcesso).toBe("3448-24.1T8PRTA.P1.S1");
            expect(r.tipoDocumento).toBe("acordao_com_sumario");
            expect(r.hasEmbeddedSumario).toBe(true);
            expect(r.relator).toBe("MOG");
        });

        it("parses sumário + descritores with relator containing spaces", () => {
            const r = parseFilename("13041-23.0TBLSB.L1.S1+Sumário+Descritores-LEspirito Santo.docx");
            expect(r.nrProcesso).toBe("13041-23.0TBLSB.L1.S1");
            expect(r.tipoDocumento).toBe("acordao_com_sumario_e_descritores");
            expect(r.hasEmbeddedSumario).toBe(true);
            expect(r.hasEmbeddedDescritores).toBe(true);
            expect(r.relator).toBe("LEspirito Santo");
        });

        it("parses sumário + descritores (another example)", () => {
            const r = parseFilename("18031-24.3T8PRTC.P1.S1+Sumário+Descritores-LEspirito Santo.docx");
            expect(r.nrProcesso).toBe("18031-24.3T8PRTC.P1.S1");
            expect(r.tipoDocumento).toBe("acordao_com_sumario_e_descritores");
            expect(r.hasEmbeddedSumario).toBe(true);
            expect(r.hasEmbeddedDescritores).toBe(true);
        });

        it("parses sumário + descritores without relator name with spaces", () => {
            const r = parseFilename("872-19.5T8OLH.E1.S1+Sumário-RCostaProcess.docx");
            expect(r.nrProcesso).toBe("872-19.5T8OLH.E1.S1");
            expect(r.tipoDocumento).toBe("acordao_com_sumario");
            expect(r.hasEmbeddedSumario).toBe(true);
            expect(r.relator).toBe("RCostaProcess");
        });
    });

    describe("Fallback — no recognized pattern", () => {
        it("treats entire basename as process number", () => {
            const r = parseFilename("2731-23.4T8LSB.L1.S1.txt");
            expect(r.nrProcesso).toBe("2731-23.4T8LSB.L1.S1");
            expect(r.tipoDocumento).toBe("acordao");
            expect(r.hasEmbeddedSumario).toBe(false);
            expect(r.hasEmbeddedDescritores).toBe(false);
            expect(r.relator).toBeUndefined();
        });
    });
});

describe("extractProcessNumber", () => {
    it.each([
        ["507-25.7PEOER.L1.S1_Sumário.docx", "507-25.7PEOER.L1.S1"],
        ["551-24.1JELSB.L1.S1_Acórdão.docx", "551-24.1JELSB.L1.S1"],
        ["1114_25.0SJPRT.P1-A.S1_Acórdão.docx", "1114_25.0SJPRT.P1-A.S1"],
        ["749-22.7JABRG.G1.S1 - Acórdão - CCLobo.docx", "749-22.7JABRG.G1.S1"],
        ["1-26.9YFLSB+Sumário-ISalgado.docx", "1-26.9YFLSB"],
        ["13041-23.0TBLSB.L1.S1+Sumário+Descritores-LEspirito Santo.docx", "13041-23.0TBLSB.L1.S1"],
        ["2731-23.4T8LSB.L1.S1.txt", "2731-23.4T8LSB.L1.S1"],
    ])("extracts from %s → %s", (filename, expected) => {
        expect(extractProcessNumber(filename)).toBe(expected);
    });
});
