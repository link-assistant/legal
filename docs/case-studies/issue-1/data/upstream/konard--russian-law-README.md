[![Gitpod](https://img.shields.io/badge/Gitpod-ready--to--code-blue?logo=gitpod)](https://gitpod.io/#https://github.com/konard/russian-law)

# russian-law

Html preview: https://konard.github.io/russian-law

## Load latest constitution
```sh
node load-html.js --name=102027595 --source-document-id=102027595
```

## Load latest criminal code
```sh
node load-html.js --name="102041891" --source-document-id=102041891
```

## Load latest code of administrative offenses
```sh
node load-actual-html.js --name="434767" --source-document-id=434767
```

## Load documents with pagination support

For large documents that timeout with standard loading, use the pagination-enabled script:

### Basic usage (single page or auto-detect)
```sh
node load-paginated-html.js --name="document-name" --source-document-id=102074277
```

### Load with pagination parameters
```sh
node load-paginated-html.js --name="document-name" --source-document-id=102074277 --rdk=835 --start-page=1 --end-page=5
```

### Auto-detect available pages
```sh
node load-paginated-html.js --name="document-name" --source-document-id=102074277 --rdk=835 --max-pages=10
```

### Combine multiple pages into single file
```sh
node load-paginated-html.js --name="document-name" --source-document-id=102074277 --rdk=835 --start-page=1 --end-page=5 --combine
```

### Options
- `--source-document-id`: Document ID (required)
- `--name`: Output file name (required)
- `--rdk`: RDK parameter for pagination (when required by document)
- `--link-id`: Link ID parameter (default: 0)
- `--start-page`: Starting page number (default: 1)
- `--end-page`: Ending page number (if specified)
- `--max-pages`: Maximum pages to attempt (default: 10)
- `--combine`: Combine all pages into single file
- `--directory`: Output directory (default: ./data/html)

**Note**: This script addresses timeout issues with large documents by supporting pagination parameters and handling each page separately.