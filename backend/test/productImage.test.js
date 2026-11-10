const assert = require('node:assert/strict');
const fs = require('fs/promises');
const { test } = require('node:test');
const { salvarImagemProduto, removerImagemProduto } = require('../src/utils/productImage');

const exemplos = [
    ['image/jpeg', 'JPG', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
    ['image/png', 'PNG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ['image/webp', 'WEBP', Buffer.from('RIFF0000WEBP', 'ascii')]
];

for (const [mime, formato, conteudo] of exemplos) {
    test(`armazena e remove imagem ${formato}`, async () => {
        const caminho = await salvarImagemProduto(`data:${mime};base64,${conteudo.toString('base64')}`);
        try {
            assert.match(caminho, new RegExp(`^/uploads/produtos/[\\da-f-]+\\.${formato === 'JPG' ? 'jpg' : formato.toLowerCase()}$`, 'i'));
            const arquivo = await fs.readFile(require('path').resolve(__dirname, '../uploads', caminho.slice('/uploads/'.length)));
            assert.deepEqual(arquivo, conteudo);
        } finally {
            await removerImagemProduto(caminho);
        }
        await assert.rejects(
            fs.access(require('path').resolve(__dirname, '../uploads', caminho.slice('/uploads/'.length))),
            { code: 'ENOENT' }
        );
    });
}

test('rejeita formatos não permitidos e conteúdo que não corresponde ao formato', async () => {
    await assert.rejects(
        salvarImagemProduto('data:image/gif;base64,R0lGODlh'),
        { status: 400, message: /JPG, JPEG, PNG ou WEBP/ }
    );
    await assert.rejects(
        salvarImagemProduto(`data:image/png;base64,${Buffer.from('não é PNG').toString('base64')}`),
        { status: 400, message: /não corresponde/ }
    );
});

test('rejeita imagens maiores que 5 MB', async () => {
    const conteudo = Buffer.alloc(5 * 1024 * 1024 + 1);
    conteudo.set(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    await assert.rejects(
        salvarImagemProduto(`data:image/png;base64,${conteudo.toString('base64')}`),
        { status: 400, message: /no máximo 5 MB/ }
    );
});

test('não remove caminhos que não pertencem ao armazenamento local de imagens', async () => {
    await assert.doesNotReject(removerImagemProduto('https://example.com/image.jpg'));
    await assert.doesNotReject(removerImagemProduto('/uploads/../../server.js'));
});
