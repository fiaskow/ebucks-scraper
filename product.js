class Product {
    constructor(name, price, url, html) {
      this.name = name;
      this.price = price;
      this.url = url;
      this.html = html;
      this.isNew = false;
      this.isExpired = false;
    }

  get discountPrice() {
    return price * 0.6;
  }

}

module.exports = Product