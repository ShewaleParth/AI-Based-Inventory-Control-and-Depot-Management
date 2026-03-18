"""
AI Inventory Assistant using Groq API (Llama 3.1)
Provides conversational interface for inventory management
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq
import os
import json
from datetime import datetime, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Initialize Groq client
groq_client = Groq(api_key=os.getenv('GROQ_API_KEY'))

# MongoDB connection
MONGODB_URI = os.getenv('MONGODB_URI')
client = MongoClient(MONGODB_URI)
db = client['inventroops']
products_collection = db['products']
depots_collection = db['depots']
transactions_collection = db['transactions']
forecasts_collection = db['forecasts']


conversation_history = {}




def get_low_stock_products(threshold: int = None):
    try:
        query = {}
        if threshold:
            query = {"stock": {"$lt": threshold}}
        else:
            query = {"$expr": {"$lt": ["$stock", "$reorderPoint"]}}
        
        products = list(products_collection.find(query).limit(50))
        
        result = []
        for p in products:
            result.append({
                "sku": p.get("sku"),
                "name": p.get("name"),
                "stock": p.get("stock"),
                "reorderPoint": p.get("reorderPoint"),
                "category": p.get("category"),
                "supplier": p.get("supplier")
            })
        
        return {
            "success": True,
            "count": len(result),
            "products": result
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_products_running_out(days: int = 7):
   
    try:
       
        products = list(products_collection.find({
            "$or": [
                {"status": {"$in": ["low-stock", "out-of-stock"]}},
                {"$expr": {"$lte": ["$stock", {"$multiply": ["$reorderPoint", 1.5]}]}}
            ]
        }).limit(50))
        
        result = []
        for p in products:
            stock = p.get("stock", 0)
            reorder_point = p.get("reorderPoint", 10)
            daily_sales = p.get("dailySales", 1)
            
            # Calculate estimated days until stockout
            if daily_sales > 0:
                days_remaining = stock / daily_sales
            else:
                days_remaining = 999
            
            # Determine risk level
            if days_remaining <= 3:
                risk_level = "Critical"
            elif days_remaining <= 7:
                risk_level = "High"
            elif days_remaining <= 14:
                risk_level = "Medium"
            else:
                risk_level = "Low"
            
            # Only include products that will run out within the specified days
            if days_remaining <= days:
                result.append({
                    "sku": p.get("sku"),
                    "productName": p.get("name"),
                    "currentStock": stock,
                    "etaDays": round(days_remaining, 1),
                    "riskLevel": risk_level,
                    "recommendedReorder": max(reorder_point, int(daily_sales * 30)),
                    "category": p.get("category"),
                    "supplier": p.get("supplier")
                })
        
        result.sort(key=lambda x: x["etaDays"])
        
        return {
            "success": True,
            "count": len(result),
            "products": result,
            "timeframe": f"{days} days",
            "source": "products_collection"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_reorder_recommendations():
    """Get AI-powered reorder recommendations from inventory"""
    try:
        # Get products with low stock or below reorder point from products collection
        products = list(products_collection.find({
            "$or": [
                {"status": {"$in": ["low-stock", "out-of-stock"]}},
                {"$expr": {"$lt": ["$stock", "$reorderPoint"]}}
            ]
        }).sort("stock", 1).limit(20))
        
        recommendations = []
        for p in products:
            stock = p.get("stock", 0)
            reorder_point = p.get("reorderPoint", 10)
            daily_sales = p.get("dailySales", 1)
            
            # Calculate recommended quantity
            recommended_qty = max(reorder_point, int(daily_sales * 30))
            
            # Determine urgency
            if stock <= 0:
                urgency = "Critical"
            elif stock < reorder_point * 0.5:
                urgency = "High"
            elif stock < reorder_point:
                urgency = "Medium"
            else:
                urgency = "Low"
            
            recommendations.append({
                "sku": p.get("sku"),
                "productName": p.get("name"),
                "currentStock": stock,
                "reorderPoint": reorder_point,
                "recommendedQuantity": recommended_qty,
                "urgency": urgency,
                "reason": f"Stock at {stock} units, below reorder point of {reorder_point}",
                "category": p.get("category"),
                "supplier": p.get("supplier"),
                "price": p.get("price")
            })
        
        return {
            "success": True,
            "count": len(recommendations),
            "recommendations": recommendations,
            "source": "products_collection"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def search_products(query: str, category: str = None, limit: int = 10):
    """Search products by name, SKU, or category"""
    try:
        search_filter = {
            "$or": [
                {"name": {"$regex": query, "$options": "i"}},
                {"sku": {"$regex": query, "$options": "i"}},
                {"category": {"$regex": query, "$options": "i"}}
            ]
        }
        
        if category:
            search_filter["category"] = category
        
        products = list(products_collection.find(search_filter).limit(limit))
        
        result = []
        for p in products:
            result.append({
                "id": str(p.get("_id")),
                "sku": p.get("sku"),
                "name": p.get("name"),
                "category": p.get("category"),
                "stock": p.get("stock"),
                "status": p.get("status"),
                "price": p.get("price")
            })
        
        return {
            "success": True,
            "count": len(result),
            "products": result
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_product_details(sku: str):
    """Get detailed information about a specific product"""
    try:
        product = products_collection.find_one({"sku": sku})
        
        if not product:
            return {"success": False, "error": f"Product {sku} not found"}
        
        # Get forecast data
        forecast = forecasts_collection.find_one({"sku": sku})
        
        # Get recent transactions
        transactions = list(transactions_collection.find(
            {"productSku": sku}
        ).sort("timestamp", -1).limit(5))
        
        return {
            "success": True,
            "product": {
                "sku": product.get("sku"),
                "name": product.get("name"),
                "category": product.get("category"),
                "stock": product.get("stock"),
                "reorderPoint": product.get("reorderPoint"),
                "supplier": product.get("supplier"),
                "price": product.get("price"),
                "status": product.get("status")
            },
            "forecast": forecast.get("aiInsights") if forecast else None,
            "recentTransactions": len(transactions)
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_depot_info(depot_name: str = None):
    """Get information about depots"""
    try:
        if depot_name:
            depot = depots_collection.find_one({"name": {"$regex": depot_name, "$options": "i"}})
            if not depot:
                return {"success": False, "error": f"Depot '{depot_name}' not found"}
            
            return {
                "success": True,
                "depot": {
                    "name": depot.get("name"),
                    "location": depot.get("location"),
                    "capacity": depot.get("capacity"),
                    "currentUtilization": depot.get("currentUtilization"),
                    "itemsStored": depot.get("itemsStored"),
                    "status": depot.get("status")
                }
            }
        else:
            depots = list(depots_collection.find().limit(10))
            return {
                "success": True,
                "count": len(depots),
                "depots": [{
                    "name": d.get("name"),
                    "location": d.get("location"),
                    "utilization": f"{(d.get('currentUtilization', 0) / d.get('capacity', 1) * 100):.1f}%",
                    "status": d.get("status")
                } for d in depots]
            }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_inventory_stats():
    """Get overall inventory statistics"""
    try:
        total_products = products_collection.count_documents({})
        low_stock = products_collection.count_documents({"status": "low-stock"})
        out_of_stock = products_collection.count_documents({"status": "out-of-stock"})
        in_stock = products_collection.count_documents({"status": "in-stock"})
        
        # Get total inventory value
        pipeline = [
            {"$group": {
                "_id": None,
                "totalValue": {"$sum": {"$multiply": ["$stock", "$price"]}},
                "totalUnits": {"$sum": "$stock"}
            }}
        ]
        value_result = list(products_collection.aggregate(pipeline))
        
        return {
            "success": True,
            "stats": {
                "totalProducts": total_products,
                "inStock": in_stock,
                "lowStock": low_stock,
                "outOfStock": out_of_stock,
                "totalValue": value_result[0]["totalValue"] if value_result else 0,
                "totalUnits": value_result[0]["totalUnits"] if value_result else 0
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================================
# AGENTIC ACTION FUNCTIONS - AI can execute these actions
# ============================================================================

def add_product(sku: str, name: str, category: str, stock: int, price: float, 
                reorder_point: int = 10, supplier: str = "Unknown", location: str = "Main Warehouse"):
    """Add a new product to inventory"""
    try:
        # Check if product already exists
        existing = products_collection.find_one({"sku": sku})
        if existing:
            return {"success": False, "error": f"Product with SKU {sku} already exists"}
        
        # Determine status based on stock
        if stock <= 0:
            status = "out-of-stock"
        elif stock <= reorder_point:
            status = "low-stock"
        else:
            status = "in-stock"
        
        # Create product document
        product = {
            "sku": sku,
            "name": name,
            "category": category,
            "stock": stock,
            "price": price,
            "reorderPoint": reorder_point,
            "supplier": supplier,
            "location": location,
            "status": status,
            "lastSoldDate": datetime.now().isoformat(),
            "createdAt": datetime.now(),
            "updatedAt": datetime.now()
        }
        
        # Insert into database
        result = products_collection.insert_one(product)
        
        # Create initial stock-in transaction
        transaction = {
            "productId": str(result.inserted_id),
            "productName": name,
            "productSku": sku,
            "transactionType": "stock-in",
            "quantity": stock,
            "previousStock": 0,
            "newStock": stock,
            "reason": "Initial stock",
            "notes": "Product added via AI Assistant",
            "performedBy": "AI Assistant",
            "timestamp": datetime.now()
        }
        transactions_collection.insert_one(transaction)
        
        return {
            "success": True,
            "message": f"Product {name} (SKU: {sku}) added successfully with {stock} units",
            "product": {
                "sku": sku,
                "name": name,
                "stock": stock,
                "status": status
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def move_stock(sku: str, from_depot: str, to_depot: str, quantity: int):
    """Transfer stock between depots"""
    try:
        # Get product
        product = products_collection.find_one({"sku": sku})
        if not product:
            return {"success": False, "error": f"Product {sku} not found"}
        
        # Verify sufficient stock
        if product.get("stock", 0) < quantity:
            return {
                "success": False, 
                "error": f"Insufficient stock. Available: {product.get('stock', 0)}, Requested: {quantity}"
            }
        
        # Get depot IDs
        from_depot_doc = depots_collection.find_one({"name": {"$regex": from_depot, "$options": "i"}})
        to_depot_doc = depots_collection.find_one({"name": {"$regex": to_depot, "$options": "i"}})
        
        if not from_depot_doc:
            return {"success": False, "error": f"Source depot '{from_depot}' not found"}
        if not to_depot_doc:
            return {"success": False, "error": f"Destination depot '{to_depot}' not found"}
        
        # Create transfer transaction
        transaction = {
            "productId": str(product.get("_id")),
            "productName": product.get("name"),
            "productSku": sku,
            "transactionType": "transfer",
            "quantity": quantity,
            "fromDepot": from_depot_doc.get("name"),
            "toDepot": to_depot_doc.get("name"),
            "fromDepotId": str(from_depot_doc.get("_id")),
            "toDepotId": str(to_depot_doc.get("_id")),
            "previousStock": product.get("stock"),
            "newStock": product.get("stock"),  # Stock stays same, just location changes
            "reason": "Stock transfer",
            "notes": f"Transferred via AI Assistant from {from_depot} to {to_depot}",
            "performedBy": "AI Assistant",
            "timestamp": datetime.now()
        }
        transactions_collection.insert_one(transaction)
        
        return {
            "success": True,
            "message": f"Transferred {quantity} units of {product.get('name')} from {from_depot} to {to_depot}",
            "transfer": {
                "product": product.get("name"),
                "quantity": quantity,
                "from": from_depot_doc.get("name"),
                "to": to_depot_doc.get("name")
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def update_stock(sku: str, quantity: int, operation: str = "add", reason: str = "Stock adjustment"):
    """Update product stock (add, remove, or set)"""
    try:
        # Get product
        product = products_collection.find_one({"sku": sku})
        if not product:
            return {"success": False, "error": f"Product {sku} not found"}
        
        current_stock = product.get("stock", 0)
        
        # Calculate new stock
        if operation == "add":
            new_stock = current_stock + quantity
            transaction_type = "stock-in"
        elif operation == "remove":
            new_stock = current_stock - quantity
            transaction_type = "stock-out"
            if new_stock < 0:
                return {"success": False, "error": "Cannot remove more stock than available"}
        elif operation == "set":
            new_stock = quantity
            transaction_type = "adjustment"
        else:
            return {"success": False, "error": f"Invalid operation: {operation}"}
        
        # Update status
        reorder_point = product.get("reorderPoint", 10)
        if new_stock <= 0:
            status = "out-of-stock"
        elif new_stock <= reorder_point:
            status = "low-stock"
        else:
            status = "in-stock"
        
        # Update product
        products_collection.update_one(
            {"sku": sku},
            {"$set": {
                "stock": new_stock,
                "status": status,
                "updatedAt": datetime.now()
            }}
        )
        
        # Create transaction
        transaction = {
            "productId": str(product.get("_id")),
            "productName": product.get("name"),
            "productSku": sku,
            "transactionType": transaction_type,
            "quantity": abs(quantity),
            "previousStock": current_stock,
            "newStock": new_stock,
            "reason": reason,
            "notes": f"Stock {operation} via AI Assistant",
            "performedBy": "AI Assistant",
            "timestamp": datetime.now()
        }
        transactions_collection.insert_one(transaction)
        
        return {
            "success": True,
            "message": f"Stock updated for {product.get('name')}: {current_stock} → {new_stock} units",
            "update": {
                "product": product.get("name"),
                "previousStock": current_stock,
                "newStock": new_stock,
                "operation": operation,
                "status": status
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def update_product_details(sku: str, **updates):
    """Update product information (price, supplier, reorder point, etc.)"""
    try:
        # Get product
        product = products_collection.find_one({"sku": sku})
        if not product:
            return {"success": False, "error": f"Product {sku} not found"}
        
        # Allowed fields to update
        allowed_fields = ["name", "price", "reorderPoint", "supplier", "location", "category"]
        update_doc = {}
        
        for key, value in updates.items():
            if key in allowed_fields:
                update_doc[key] = value
        
        if not update_doc:
            return {"success": False, "error": "No valid fields to update"}
        
        update_doc["updatedAt"] = datetime.now()
        
        # Update product
        products_collection.update_one(
            {"sku": sku},
            {"$set": update_doc}
        )
        
        return {
            "success": True,
            "message": f"Updated {product.get('name')} details",
            "updates": update_doc
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def generate_report(report_type: str = "inventory_summary"):
    """Generate various reports"""
    try:
        if report_type == "inventory_summary":
            # Overall inventory summary
            total_products = products_collection.count_documents({})
            low_stock = products_collection.count_documents({"status": "low-stock"})
            out_of_stock = products_collection.count_documents({"status": "out-of-stock"})
            
            # Top categories
            pipeline = [
                {"$group": {
                    "_id": "$category",
                    "count": {"$sum": 1},
                    "totalValue": {"$sum": {"$multiply": ["$stock", "$price"]}}
                }},
                {"$sort": {"totalValue": -1}},
                {"$limit": 5}
            ]
            top_categories = list(products_collection.aggregate(pipeline))
            
            return {
                "success": True,
                "report_type": "Inventory Summary",
                "data": {
                    "totalProducts": total_products,
                    "lowStock": low_stock,
                    "outOfStock": out_of_stock,
                    "topCategories": [
                        {
                            "category": cat["_id"],
                            "products": cat["count"],
                            "value": cat["totalValue"]
                        } for cat in top_categories
                    ]
                }
            }
        
        elif report_type == "recent_transactions":
            # Recent transactions
            transactions = list(transactions_collection.find()
                              .sort("timestamp", -1)
                              .limit(10))
            
            return {
                "success": True,
                "report_type": "Recent Transactions",
                "data": {
                    "transactions": [
                        {
                            "product": t.get("productName"),
                            "type": t.get("transactionType"),
                            "quantity": t.get("quantity"),
                            "timestamp": t.get("timestamp").strftime("%Y-%m-%d %H:%M")
                        } for t in transactions
                    ]
                }
            }
        
        else:
            return {"success": False, "error": f"Unknown report type: {report_type}"}
            
    except Exception as e:
        return {"success": False, "error": str(e)}



# ============================================================================
# GROQ AI AGENT CONFIGURATION
# ============================================================================

# Define tools for function calling
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_low_stock_products",
            "description": "Get products with stock below reorder point or a specific threshold",
            "parameters": {
                "type": "object",
                "properties": {
                    "threshold": {
                        "type": "integer",
                        "description": "Optional stock threshold. If not provided, uses reorder point"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_products_running_out",
            "description": "Get products that will run out of stock in the next N days based on AI forecasts",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {
                        "type": "integer",
                        "description": "Number of days to look ahead (default: 7)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_reorder_recommendations",
            "description": "Get AI-powered recommendations for which products to reorder today",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search for products by name, SKU, or category",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query (product name, SKU, or keyword)"
                    },
                    "category": {
                        "type": "string",
                        "description": "Optional category filter"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 10)"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_product_details",
            "description": "Get detailed information about a specific product including forecast and transactions",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku": {
                        "type": "string",
                        "description": "Product SKU code"
                    }
                },
                "required": ["sku"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_depot_info",
            "description": "Get information about warehouse depots",
            "parameters": {
                "type": "object",
                "properties": {
                    "depot_name": {
                        "type": "string",
                        "description": "Optional depot name to get specific depot info"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_inventory_stats",
            "description": "Get overall inventory statistics and summary",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    # AGENTIC ACTION TOOLS
    {
        "type": "function",
        "function": {
            "name": "add_product",
            "description": "Add a new product to the inventory database",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku": {"type": "string", "description": "Product SKU code (unique)"},
                    "name": {"type": "string", "description": "Product name"},
                    "category": {"type": "string", "description": "Product category"},
                    "stock": {"type": "integer", "description": "Initial stock quantity"},
                    "price": {"type": "number", "description": "Product price"},
                    "reorder_point": {"type": "integer", "description": "Reorder point threshold (default: 10)"},
                    "supplier": {"type": "string", "description": "Supplier name (default: Unknown)"},
                    "location": {"type": "string", "description": "Storage location (default: Main Warehouse)"}
                },
                "required": ["sku", "name", "category", "stock", "price"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "move_stock",
            "description": "Transfer stock between depots/warehouses",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku": {"type": "string", "description": "Product SKU code"},
                    "from_depot": {"type": "string", "description": "Source depot name"},
                    "to_depot": {"type": "string", "description": "Destination depot name"},
                    "quantity": {"type": "integer", "description": "Quantity to transfer"}
                },
                "required": ["sku", "from_depot", "to_depot", "quantity"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_stock",
            "description": "Update product stock quantity (add, remove, or set)",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku": {"type": "string", "description": "Product SKU code"},
                    "quantity": {"type": "integer", "description": "Quantity to add/remove/set"},
                    "operation": {
                        "type": "string",
                        "enum": ["add", "remove", "set"],
                        "description": "Operation type: 'add' (increase), 'remove' (decrease), or 'set' (set exact value)"
                    },
                    "reason": {"type": "string", "description": "Reason for stock update"}
                },
                "required": ["sku", "quantity"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_product_details",
            "description": "Update product information like price, supplier, reorder point, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku": {"type": "string", "description": "Product SKU code"},
                    "name": {"type": "string", "description": "New product name"},
                    "price": {"type": "number", "description": "New price"},
                    "reorderPoint": {"type": "integer", "description": "New reorder point"},
                    "supplier": {"type": "string", "description": "New supplier name"},
                    "location": {"type": "string", "description": "New location"},
                    "category": {"type": "string", "description": "New category"}
                },
                "required": ["sku"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_report",
            "description": "Generate various inventory reports",
            "parameters": {
                "type": "object",
                "properties": {
                    "report_type": {
                        "type": "string",
                        "enum": ["inventory_summary", "recent_transactions"],
                        "description": "Type of report to generate"
                    }
                }
            }
        }
    }
]

# Map function names to actual functions
FUNCTION_MAP = {
    "get_low_stock_products": get_low_stock_products,
    "get_products_running_out": get_products_running_out,
    "get_reorder_recommendations": get_reorder_recommendations,
    "search_products": search_products,
    "get_product_details": get_product_details,
    "get_depot_info": get_depot_info,
    "get_inventory_stats": get_inventory_stats,
    # Agentic actions
    "add_product": add_product,
    "move_stock": move_stock,
    "update_stock": update_stock,
    "update_product_details": update_product_details,
    "generate_report": generate_report
}

SYSTEM_PROMPT = """You are an AI inventory management assistant for Sangrahak, an intelligent inventory control system with AGENTIC CAPABILITIES.

Your role is to help users manage their inventory efficiently by:
- Answering questions about products, stock levels, and forecasts
- Providing smart recommendations for reordering
- Analyzing trends and patterns
- Helping with depot management
- Generating insights from data
- **PERFORMING ACTIONS**: You can add products, move stock, update inventory, and more!

AVAILABLE ACTIONS (use these tools when appropriate):
1. **add_product** - Add new products to inventory
2. **move_stock** - Transfer stock between depots
3. **update_stock** - Add, remove, or set stock quantities
4. **update_product_details** - Modify product information
5. **generate_report** - Create inventory reports

Guidelines:
1. Be concise and actionable in your responses
2. Always use the available tools to fetch real-time data
3. Provide specific numbers and SKUs when relevant
4. Highlight urgent issues (stockouts, critical items)
5. Suggest next steps or actions when appropriate
6. Format responses clearly with bullet points, numbers, or tables
7. **When asked to perform an action, USE THE APPROPRIATE TOOL** - don't just explain, actually do it!
8. After performing an action, confirm what was done and show the results
9. Use markdown-like formatting: **bold** for emphasis, ## for headers, - for bullets, numbers for lists
10. Be proactive - if you see a problem, suggest solutions

RESPONSE FORMATTING:
- Use **bold** for important items (product names, SKUs, numbers)
- Use ## for section headers
- Use bullet points (-) for lists
- Use numbers (1., 2., 3.) for sequential steps
- Keep responses organized and scannable

Current date: {current_date}

Be helpful, professional, data-driven, and ACTION-ORIENTED in your responses!"""


def chat_with_ai(user_message: str, session_id: str = "default"):
    """
    Main chat function that processes user messages using Groq AI
    """
    try:
        # Get or create conversation history
        if session_id not in conversation_history:
            conversation_history[session_id] = []
        
        # Add user message to history
        conversation_history[session_id].append({
            "role": "user",
            "content": user_message
        })
        
        # Prepare messages for Groq
        messages = [
            {
                "role": "system",
                "content": SYSTEM_PROMPT.format(
                    current_date=datetime.now().strftime("%Y-%m-%d")
                )
            }
        ] + conversation_history[session_id]
        
        # Call Groq API with function calling
        try:
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                temperature=0.7,
                max_tokens=2048  # Increased for better responses
            )
        except Exception as groq_error:
            print(f"❌ Groq API Error: {groq_error}")
            # Fallback: try without tools if tool calling fails
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
                temperature=0.7,
                max_tokens=1024
            )
        
        assistant_message = response.choices[0].message
        
        # Check if AI wants to call functions
        if assistant_message.tool_calls:
            # Execute function calls
            for tool_call in assistant_message.tool_calls:
                function_name = tool_call.function.name
                function_args_str = tool_call.function.arguments
                
                # Parse arguments, default to empty dict if None or empty
                try:
                    function_args = json.loads(function_args_str) if function_args_str else {}
                except json.JSONDecodeError:
                    function_args = {}
                
                # Ensure function_args is a dict
                if function_args is None:
                    function_args = {}
                
                print(f"🔧 Calling function: {function_name} with args: {function_args}")
                
                # Execute the function
                try:
                    function_response = FUNCTION_MAP[function_name](**function_args)
                except Exception as func_error:
                    print(f"❌ Function execution error: {func_error}")
                    function_response = {
                        "success": False,
                        "error": f"Function execution failed: {str(func_error)}"
                    }
                
                # Add function response to conversation
                messages.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [tool_call.model_dump()]
                })
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(function_response)
                })
            
            # Get final response from AI after function calls
            try:
                final_response = groq_client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=messages,
                    temperature=0.7,
                    max_tokens=2048
                )
                assistant_message = final_response.choices[0].message
            except Exception as final_error:
                print(f" Error getting final response: {final_error}")
                # Use function response directly
                assistant_message.content = f"I executed the function but encountered an error getting the final response: {str(final_error)}"
        
        # Add assistant response to history
        conversation_history[session_id].append({
            "role": "assistant",
            "content": assistant_message.content
        })
        
        # Keep only last 10 messages to avoid token limits
        if len(conversation_history[session_id]) > 10:
            conversation_history[session_id] = conversation_history[session_id][-10:]
        
        return {
            "success": True,
            "message": assistant_message.content or "Action completed successfully.",
            "session_id": session_id
        }
        
    except Exception as e:
        print(f" Error in chat_with_ai: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e),
            "message": "I encountered an error processing your request. Please try rephrasing your question or try a simpler command."
        }


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.route('/api/ai/chat', methods=['POST'])
def chat():
    """Main chat endpoint"""
    try:
        data = request.json
        user_message = data.get('message', '')
        session_id = data.get('session_id', 'default')
        
        if not user_message:
            return jsonify({
                "success": False,
                "error": "Message is required"
            }), 400
        
        print(f" User: {user_message}")
        
        response = chat_with_ai(user_message, session_id)
        
        print(f" AI: {response.get('message', 'Error')}")
        
        return jsonify(response)
        
    except Exception as e:
        print(f" Error in /api/ai/chat: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/api/ai/clear-history', methods=['POST'])
def clear_history():
    """Clear conversation history for a session"""
    try:
        data = request.json
        session_id = data.get('session_id', 'default')
        
        if session_id in conversation_history:
            del conversation_history[session_id]
        
        return jsonify({
            "success": True,
            "message": "Conversation history cleared"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


@app.route('/api/ai/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "OK",
        "service": "AI Assistant",
        "model": "llama-3.3-70b-versatile",
        "provider": "Groq",
        "timestamp": datetime.now().isoformat()
    })


if __name__ == '__main__':
    print(" Starting AI Inventory Assistant...")
    print(" Model: Llama 3.3 70B (via Groq)")
    print(" Tools: 7 inventory management functions")
    print(" Running on http://localhost:5002")
    
    app.run(debug=True, port=5002, host='0.0.0.0')
