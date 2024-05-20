const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const fastCsv = require('fast-csv');
const csvParser = require('csv-parser');
const path = require('path');
const mysql = require('mysql2/promise');
const { format } = require('date-fns');
const app = express();

const CSV_FILENAME = 'data.csv';


// Configurações do banco de dados
const dbConfig = {
    host: 'clovisgarcia.com.br',
    user: 'clov_pivi',
    password: 'pivi',
    database: 'clov_pivi'
};

// Dados iniciais
let statusData = {
    tipo: null,
    valor: null,
    data: null,
    hora: null,
    alarme1: "00:00",
    alarme2: "00:00"
};

let buttonFood = {
    food: 0
};

let defAlarme1 = {
    alarme1: null,
    update: 0
};

let defAlarme2 = {
    alarme2: null,
    update: 0
};

app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/templates/index.html'));
});

app.get('/data.csv', (req, res) => {
    if (fs.existsSync(CSV_FILENAME)) {
        res.download(CSV_FILENAME);
    } else {
        res.status(404).json({ error: "Arquivo CSV não encontrado" });
    }
});

app.get('/statusalarme1', (req, res) => {
    res.json(defAlarme1);
});

app.post('/alarme1', (req, res) => {
    try {
        const { alarme1, update } = req.body;
        if (alarme1 === undefined || update === undefined) {
            throw new Error("JSON incompleto. A chave 'alarme1' e 'update' são necessárias.");
        }
        defAlarme1 = { alarme1, update };
        console.log("Alarme 1:", alarme1);
        console.log("Update:", update);
        res.status(200).json({ message: "Dados recebidos com sucesso." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/statusalarme2', (req, res) => {
    res.json(defAlarme2);
});

app.post('/alarme2', (req, res) => {
    try {
        const { alarme2, update } = req.body;
        if (alarme2 === undefined || update === undefined) {
            throw new Error("JSON incompleto. A chave 'alarme2' e 'update' são necessárias.");
        }
        defAlarme2 = { alarme2, update };
        console.log("Alarme 2:", alarme2);
        console.log("Update:", update);
        res.status(200).json({ message: "Dados recebidos com sucesso." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/statusfood', (req, res) => {
    res.json(buttonFood);
});

app.post('/food', (req, res) => {
    try {
        const { food } = req.body;
        if (food === undefined) {
            throw new Error("JSON incompleto. A chave 'food' é necessária.");
        }
        buttonFood.food = food;
        console.log("Botão:", food);
        res.status(200).json({ message: "Dados recebidos com sucesso." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/status', (req, res) => {
    res.json(statusData);
});

app.post('/statusarduino', async (req, res) => {
    try {
        const { tipo, valor, data, hora, alarme1, alarme2 } = req.body;
        if (tipo === undefined || valor === undefined || data === undefined || hora === undefined || alarme1 === undefined || alarme2 === undefined) {
            throw new Error("JSON incompleto. As chaves 'tipo', 'valor', 'data', 'hora', 'alarme1' e 'alarme2' são necessárias.");
        }
        statusData = { tipo, valor, data, hora, alarme1, alarme2 };

        const filteredStatusData = { tipo, valor, data, hora };

        const ws = fs.createWriteStream(CSV_FILENAME, { flags: fs.existsSync(CSV_FILENAME) ? 'a' : 'w' });
        fastCsv.write([filteredStatusData], { headers: !fs.existsSync(CSV_FILENAME) }).pipe(ws);

        ws.on('finish', () => {
            fs.appendFileSync(CSV_FILENAME, '\n');
        });

        const dataFormatada = data.substring(6) + "-" + data.substring(3,5) + "-" + data.substring(0,2);

        // Conectar ao banco de dados e inserir os dados
        const connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO status_data (tipo, valor, data, hora, alarme1, alarme2) VALUES (?, ?, ?, ?, ?, ?)',
            [tipo, valor, dataFormatada, hora, alarme1, alarme2]
        );
        await connection.end();

        console.log("Tipo:", tipo);
        console.log("Valor:", valor);
        console.log("Data:", data);
        console.log("Hora:", hora);

        res.status(200).json({ message: "Dados recebidos com sucesso." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/last-10-rows', (req, res) => {
    if (!fs.existsSync(CSV_FILENAME)) {
        res.status(404).json({ error: "Arquivo CSV não encontrado" });
    } else {
        const rows = [];
        fs.createReadStream(CSV_FILENAME)
            .pipe(csvParser())
            .on('data', (data) => rows.push(data))
            .on('end', () => {
                const last10Rows = rows.slice(-10);
                res.status(200).json(last10Rows);
            })
            .on('error', (error) => {
                res.status(500).json({ error: "Erro ao ler o arquivo CSV: " + error.message });
            });
    }
});



app.get('/download-datalist', async (req, res) => {
    try {
        // Conectar ao banco de dados e obter os registros
        const connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT tipo, valor, data, hora FROM status_data');
        await connection.end();

        // Verificar se há registros
        if (rows.length === 0) {
            return res.status(404).json({ error: "Nenhum registro encontrado" });
        }

        // Converter os registros para o formato CSV
        let csvData = 'tipo,valor,data,hora\n'; // Cabeçalhos das colunas
        let linhas;
        for (const row of rows) {
            const dataFormatada = format(new Date(row.data), 'dd/MM/yyyy'); // Formatar a data para o formato brasileiro
            linhas += `${row.tipo},${row.valor},${dataFormatada},${row.hora}\n`; // Adicionar os dados ao CSV
        }
        csvData = csvData + linhas; 

        // Definir os cabeçalhos da resposta para o download do arquivo
        res.setHeader('Content-Disposition', 'attachment; filename=datalist.csv');
        res.setHeader('Content-Type', 'text/csv');

        // Enviar os dados CSV como resposta
        res.status(200).send(csvData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
