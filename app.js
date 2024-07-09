require("dotenv").config();

const axios = require("axios");
const { argv } = require("yargs");

const shopifyStoreDomain = process.env.SHOPIFY_STORE_DOMAIN;
const accessToken = process.env.SHOPIFY_STORE_ACCESS_TOKEN;

async function fetchItemsByName(searchTerm) {
  const pageSize = 250;
  let afterCursor = null;
  let mergedItemsMap = {};
  let allItems = [];

  while (true) {
    const graphqlQuery = `
      query ($name: String!, $first: Int!, $after: String) {
        products(first: $first, query: $name, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              title
              variants(first: ${pageSize}) {
                edges {
                  node {
                    title
                    price
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      name: `title:${searchTerm}*`,
      first: pageSize,
      after: afterCursor,
    };

    try {
      const response = await axios({
        url: `https://${shopifyStoreDomain}/admin/api/2021-10/graphql.json`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        data: {
          query: graphqlQuery,
          variables,
        },
      });

      const responseData = response.data;
      if (responseData.errors) {
        throw new Error(responseData.errors[0].message);
      }

      const items = responseData.data.products.edges;
      const pageInfo = responseData.data.products.pageInfo;

      if (items.length === 0) {
        console.log(`No items found matching "${searchTerm}".`);
        return;
      }

      items.forEach((item) => {
        const itemName = item.node.title;
        if (!mergedItemsMap[itemName]) {
          mergedItemsMap[itemName] = [];
        }
        mergedItemsMap[itemName] = mergedItemsMap[itemName].concat(
          item.node.variants.edges
        );
      });

      if (!pageInfo.hasNextPage) {
        break;
      }

      afterCursor = pageInfo.endCursor;
    } catch (error) {
      console.error("Error fetching items:", error.message);
      break;
    }
  }

  Object.keys(mergedItemsMap).forEach((itemName) => {
    let itemVariants = [];

    const sortedVariants = mergedItemsMap[itemName].sort((a, b) => {
      return a.node.price - b.node.price;
    });

    sortedVariants.forEach((variant) => {
      const variantName = variant.node.title;
      const variantPrice = variant.node.price;
      itemVariants.push({
        itemName,
        variantName,
        variantPrice,
      });

      allItems.push({
        itemName,
        variantName,
        variantPrice,
      });
    });
  });

  allItems.sort((a, b) => {
    return a.variantPrice - b.variantPrice;
  });

  return allItems;
}

const args = argv._;
const searchTerm = args.join(" ");

if (!searchTerm) {
  console.error("Please provide an item name.");
  process.exit(1);
}

fetchItemsByName(searchTerm)
  .then((allItems) => {
    allItems.forEach((item) => {
      console.log(
        `${item.itemName} - ${item.variantName} - price $${item.variantPrice}`
      );
    });
  })
  .catch((error) => {
    console.error("Error fetching items:", error.message);
  });
