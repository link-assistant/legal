[![Gitpod](https://img.shields.io/badge/Gitpod-ready--to--code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/deep-foundation/russian-laws-bot)

# russian-laws-bot

Before you begin, make sure you have Docker and Python installed.

## elastic-search

Model used in vector_search: https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2

A script in Python that loads strings to Elasticsearch Docker container and then allow user to search from CLI. Make sure Docker and python are installed on your machine.

### Install and start the Elasticsearch Docker container

Start container without memory limit:

```bash
docker run --restart=always -d -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" elasticsearch:7.13.4
```

Heap size for elastic search should be half of the container memory limit, source: https://www.elastic.co/guide/en/elasticsearch/guide/current/heap-sizing.html
Swap should be disabled for better performance.

Here swap is disabled, memory limit is set to 2g, and minimum and maximum heap size is set to 1g (resize should be prevented for better performance).

```bash
docker run --restart=always -d -p 9200:9200 -p 9300:9300 -e "discovery.type=single-node" --memory="2g" --memory-swap="2g" -e "ES_JAVA_OPTS=-Xms1g -Xmx1g" elasticsearch:7.13.4
```

### Start Elasticsearch if it was stopped
```bash
docker start $(docker ps -a -q --filter "ancestor=elasticsearch:7.13.4")
```

### Clear elastic search index

```bash
curl -X DELETE 'http://localhost:9200/_all'
curl -X DELETE 'http://localhost:9200/text_index'
```

## telegram-gpt-bot

### Creating a bot in Telegram
- Open `@BotFather`.
- Type `/newbot` and follow the instructions to create a new bot.
- `@BotFather` will provide a token for the new bot.

### Clone the repository
```bash
git clone https://github.com/deep-foundation/russian-laws-bot
```

### Login to the code folder
```bash
cd russian-laws-bot
```

### Setting environment variables
After entering the code folder, you will need to set up environment variables. To do this, create a `.env` file. In this file you can change the values as follows:
```env
OPENAI_API_KEY=your_openai_api_key
TELEGRAM_TOKEN=your_telegram_bot_token
```

### Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### Run locally

Without logs:

```bash
python ./main.py
```

With logs:

```bash
python main.py 2>&1 | tee log.txt
```

And if `python` is not available, but `python3` is.
```bash
python3 main.py 2>&1 | tee log.txt
```

## Building a Docker image
```bash
docker build -t russian-laws-bot .
```

## Running a Docker container
```bash
docker run -p 8080:8080 --name container-russian-laws-bot russian-laws-bot
```
