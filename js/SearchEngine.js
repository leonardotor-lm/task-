window.SearchEngine = (function() {
    
    // --- 1. TOKENIZER (Analizador Léxico) ---
    // Convierte el texto libre en unidades semánticas procesables.
    const tokenize = (query) => {
        if (!query || typeof query !== 'string') return [];
        const tokens = [];
        // Captura: Operadores lógicos, paréntesis, campos exactos (campo:"valor"), campos simples (campo:valor), textos entre comillas, o palabras sueltas.
        const regex = /\s*(AND|OR|NOT|\(|\)|[a-zA-Z_]+:"[^"]+"|[a-zA-Z_]+:[^\s()]+|"[^"]+"|[^\s()]+)\s*/g;
        let match;
        
        while ((match = regex.exec(query)) !== null) {
            if (match[1]) tokens.push(match[1]);
        }
        return tokens;
    };

    // --- 2. PARSER (Constructor del AST) ---
    // Implementa Descenso Recursivo para garantizar precedencia matemática.
    const parse = (tokens) => {
        let current = 0;

        const isAtEnd = () => current >= tokens.length;
        const peek = () => tokens[current];
        const advance = () => tokens[current++];

        // Nivel 1: OR
        const parseOr = () => {
            let left = parseAnd();
            while (!isAtEnd() && peek() === 'OR') {
                advance(); // Consumir 'OR'
                left = { type: 'LOGICAL', operator: 'OR', left: left, right: parseAnd() };
            }
            return left;
        };

        // Nivel 2: AND
        const parseAnd = () => {
            let left = parseNot();
            while (!isAtEnd() && peek() === 'AND') {
                advance(); // Consumir 'AND'
                left = { type: 'LOGICAL', operator: 'AND', left: left, right: parseNot() };
            }
            return left;
        };

        // Nivel 3: NOT
        const parseNot = () => {
            if (!isAtEnd() && peek() === 'NOT') {
                advance(); // Consumir 'NOT'
                return { type: 'UNARY', operator: 'NOT', argument: parseNot() };
            }
            return parsePrimary();
        };

        // Nivel 4: Nodos primarios (Campos, Texto Libre, Paréntesis)
        const parsePrimary = () => {
            if (isAtEnd()) return null;
            const token = advance();

            // Sub-árbol agrupado por paréntesis
            if (token === '(') {
                const node = parseOr();
                if (!isAtEnd() && peek() === ')') advance(); // Consumir ')'
                return node;
            }

            // Expresión de campo (ej. status:completed o context:"reunión")
            if (token.includes(':')) {
                const parts = token.split(/:(.+)/); // Dividir solo por los primeros dos puntos
                let field = parts[0];
                let value = parts[1];
                // Limpiar comillas si existen
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.substring(1, value.length - 1);
                }
                return { type: 'FILTER', field: field, value: value };
            }

            // Búsqueda de texto exacto (entre comillas) o texto libre
            let textValue = token;
            if (token.startsWith('"') && token.endsWith('"')) {
                textValue = token.substring(1, token.length - 1);
            }
            return { type: 'TEXT', value: textValue };
        };

        try {
            return parseOr();
        } catch (error) {
            console.error("SearchEngine: Error de sintaxis en el parsing.", error);
            return null;
        }
    };

    // --- 3. EVALUATOR (Motor de Inferencia Recursivo) ---
    // Resuelve la matriz lógica comparando el AST contra un objeto.
    const evaluateNode = (node, task) => {
        if (!node) return true; // Nodo vacío es neutral

        switch (node.type) {
            case 'LOGICAL':
                if (node.operator === 'AND') return evaluateNode(node.left, task) && evaluateNode(node.right, task);
                if (node.operator === 'OR') return evaluateNode(node.left, task) || evaluateNode(node.right, task);
                break;
            case 'UNARY':
                if (node.operator === 'NOT') return !evaluateNode(node.argument, task);
                break;
            case 'FILTER':
                // Validación estricta del campo estructurado
                const taskValue = task[node.field];
                if (taskValue === undefined || taskValue === null) return false;
                return String(taskValue).toLowerCase() === String(node.value).toLowerCase();
            case 'TEXT':
                // Búsqueda amplia: escanea nombre y descripción
                const term = node.value.toLowerCase();
                const nameMatch = task.name && task.name.toLowerCase().includes(term);
                const descMatch = task.description && task.description.toLowerCase().includes(term);
                return nameMatch || descMatch;
        }
        return false;
    };

    // --- CONTRATO PÚBLICO OBLIGATORIO ---
    return {
        compile: function(query) {
            if (!query || typeof query !== 'string' || query.trim() === '') {
                return { ast: null, hasActiveQuery: false };
            }
            const tokens = tokenize(query);
            const ast = parse(tokens);
            return {
                ast: ast,
                hasActiveQuery: ast !== null
            };
        },
        
        evaluate: function(task, ast) {
            // Protección contra inyecciones inválidas
            if (!task || typeof task !== 'object') return false;
            if (!ast) return true; 
            
            try {
                return evaluateNode(ast, task);
            } catch (error) {
                console.warn("SearchEngine: Fallo en evaluación de nodo.", error);
                // Fail-safe: Si el AST colapsa durante la evaluación, el nodo sobrevive
                return true; 
            }
        }
    };
})();
