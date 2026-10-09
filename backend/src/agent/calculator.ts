export function calculate(expression: string): number {
  if (expression.length > 200)
    throw new Error("Expressions are limited to 200 characters.");

  const parser = new ArithmeticParser(expression);
  const result = parser.parse();
  if (!Number.isFinite(result))
    throw new Error("The expression did not produce a finite number.");
  return result;
}

class ArithmeticParser {
  private index = 0;
  private readonly expression: string;

  constructor(expression: string) {
    this.expression = expression;
  }

  parse() {
    const result = this.parseSum();
    this.skipWhitespace();
    if (this.index !== this.expression.length)
      throw new Error(`Unexpected character at position ${this.index + 1}.`);
    return result;
  }

  private parseSum(): number {
    let result = this.parseProduct();
    while (true) {
      if (this.consume("+")) result += this.parseProduct();
      else if (this.consume("-")) result -= this.parseProduct();
      else return result;
      this.assertFinite(result);
    }
  }

  private parseProduct(): number {
    let result = this.parseUnary();
    while (true) {
      if (this.consume("*")) result *= this.parseUnary();
      else if (this.consume("/")) {
        const divisor = this.parseUnary();
        if (divisor === 0) throw new Error("Cannot divide by zero.");
        result /= divisor;
      } else if (this.consume("%")) {
        const divisor = this.parseUnary();
        if (divisor === 0) throw new Error("Cannot divide by zero.");
        result %= divisor;
      } else return result;
      this.assertFinite(result);
    }
  }

  private parseUnary(): number {
    if (this.consume("+")) return this.parseUnary();
    if (this.consume("-")) return -this.parseUnary();
    return this.parsePower();
  }

  private parsePower(): number {
    let result = this.parsePrimary();
    if (this.consume("^")) result **= this.parseUnary();
    this.assertFinite(result);
    return result;
  }

  private parsePrimary(): number {
    if (this.consume("(")) {
      const result = this.parseSum();
      if (!this.consume(")"))
        throw new Error("Expected a closing parenthesis.");
      return result;
    }

    this.skipWhitespace();
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(
      this.expression.slice(this.index),
    );
    if (!match)
      throw new Error(`Expected a number at position ${this.index + 1}.`);

    this.index += match[0].length;
    const value = Number(match[0]);
    this.assertFinite(value);
    return value;
  }

  private consume(character: string) {
    this.skipWhitespace();
    if (this.expression[this.index] !== character) return false;
    this.index += 1;
    return true;
  }

  private skipWhitespace() {
    while (/\s/.test(this.expression[this.index] ?? "")) this.index += 1;
  }

  private assertFinite(value: number) {
    if (!Number.isFinite(value))
      throw new Error("The expression did not produce a finite number.");
  }
}
