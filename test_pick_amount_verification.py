#!/usr/bin/env python3
"""
Verification test for the "low to high" random amount feature.
Tests the pick_amount() function and verifies payload/signature changes.
"""

import ast
import inspect
import json
import random
import sys
import threading
from collections import Counter
from pathlib import Path

# Add the LS_Python directory to path
sys.path.insert(0, str(Path(__file__).parent / "frontend" / "LS_Python"))

print("=" * 80)
print("PICK_AMOUNT FUNCTION VERIFICATION")
print("=" * 80)

# ============================================================================
# TEST 1: Extract and test pick_amount() function
# ============================================================================
print("\n[TEST 1] Testing pick_amount() function logic")
print("-" * 80)

# Import the function
try:
    from agent.db import pick_amount
    print("✓ Successfully imported pick_amount from agent.db")
except ImportError as e:
    print(f"✗ FAILED to import pick_amount: {e}")
    sys.exit(1)

# Test 1a: Range 10-20, run 200 times
print("\n[1a] Testing range 10-20 (200 iterations)")
results = []
for i in range(200):
    bucket = f"test_bucket_{i % 5}"  # Use 5 different buckets
    val = pick_amount(10, 20, bucket)
    results.append(val)

# Check all values in range
in_range = all(10 <= v <= 20 for v in results)
print(f"  All values in [10, 20]: {in_range} {'✓' if in_range else '✗ FAIL'}")
if not in_range:
    out_of_range = [v for v in results if not (10 <= v <= 20)]
    print(f"  Out of range values: {out_of_range}")

# Check no two consecutive equal (per bucket)
bucket_sequences = {}
for i in range(200):
    bucket = f"test_bucket_{i % 5}"
    val = results[i]
    if bucket not in bucket_sequences:
        bucket_sequences[bucket] = []
    bucket_sequences[bucket].append(val)

consecutive_equal = False
for bucket, seq in bucket_sequences.items():
    for i in range(len(seq) - 1):
        if seq[i] == seq[i + 1]:
            consecutive_equal = True
            print(f"  ✗ FAIL: Bucket {bucket} has consecutive equal values: {seq[i]} at positions {i}, {i+1}")
            break

if not consecutive_equal:
    print(f"  No consecutive equal values per bucket: True ✓")

# Check scatter (at least 6 distinct values)
distinct = len(set(results))
print(f"  Distinct values: {distinct} (expected >= 6) {'✓' if distinct >= 6 else '✗ FAIL'}")
print(f"  Value distribution: {dict(Counter(results).most_common(11))}")

# Test 1b: Edge cases
print("\n[1b] Testing edge cases")
test_cases = [
    (0, 0, "zero/zero", 0),
    (5, 5, "equal", 5),
    (20, 10, "swapped", None),  # Should swap and return value in 10-20
    (-5, 10, "negative_low", None),  # Should clamp to 0
]

for low, high, desc, expected in test_cases:
    result = pick_amount(low, high, f"edge_{desc}")
    if expected is None:
        # For swapped case, check it's in valid range
        if desc == "swapped":
            valid = 10 <= result <= 20
            print(f"  pick_amount({low}, {high}) = {result} (in [10,20]: {valid}) {'✓' if valid else '✗ FAIL'}")
        elif desc == "negative_low":
            valid = 0 <= result <= 10
            print(f"  pick_amount({low}, {high}) = {result} (in [0,10]: {valid}) {'✓' if valid else '✗ FAIL'}")
    else:
        match = result == expected
        print(f"  pick_amount({low}, {high}) = {result} (expected {expected}) {'✓' if match else '✗ FAIL'}")

# Test 1c: high <= 0 returns 0
print("\n[1c] Testing high <= 0 returns 0")
for high_val in [0, -1, -10]:
    result = pick_amount(10, high_val, "negative_high")
    match = result == 0
    print(f"  pick_amount(10, {high_val}) = {result} (expected 0) {'✓' if match else '✗ FAIL'}")

# ============================================================================
# TEST 2: Verify payload keys in db.py
# ============================================================================
print("\n" + "=" * 80)
print("[TEST 2] Verifying view_total and react_total in job payloads")
print("-" * 80)

db_path = Path(__file__).parent / "frontend" / "LS_Python" / "agent" / "db.py"
with open(db_path, 'r') as f:
    db_source = f.read()

# Parse AST
db_ast = ast.parse(db_source, filename=str(db_path))

# Find enqueue_view_job and enqueue_reaction_job functions
def find_function(tree, func_name):
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == func_name:
            return node
    return None

enqueue_view = find_function(db_ast, "enqueue_view_job")
enqueue_react = find_function(db_ast, "enqueue_reaction_job")

if enqueue_view:
    print("✓ Found enqueue_view_job function")
    # Check for view_total in the source
    func_source = ast.get_source_segment(db_source, enqueue_view)
    if func_source and '"view_total"' in func_source and 'pick_amount' in func_source:
        print("  ✓ view_total key found in payload with pick_amount call")
    else:
        print("  ✗ FAIL: view_total key or pick_amount call not found in payload")
else:
    print("✗ FAIL: enqueue_view_job function not found")

if enqueue_react:
    print("✓ Found enqueue_reaction_job function")
    # Check for react_total in the source
    func_source = ast.get_source_segment(db_source, enqueue_react)
    if func_source and '"react_total"' in func_source and 'pick_amount' in func_source:
        print("  ✓ react_total key found in payload with pick_amount call")
    else:
        print("  ✗ FAIL: react_total key or pick_amount call not found in payload")
else:
    print("✗ FAIL: enqueue_reaction_job function not found")

# ============================================================================
# TEST 3: Verify worker.py passes totals to userbot functions
# ============================================================================
print("\n" + "=" * 80)
print("[TEST 3] Verifying worker.py passes view_total/react_total to userbot")
print("-" * 80)

worker_path = Path(__file__).parent / "frontend" / "LS_Python" / "agent" / "worker.py"
with open(worker_path, 'r') as f:
    worker_source = f.read()

worker_ast = ast.parse(worker_source, filename=str(worker_path))

# Find handle_view_post and handle_react_post
handle_view = find_function(worker_ast, "handle_view_post")
handle_react = find_function(worker_ast, "handle_react_post")

def check_payload_extraction(func_node, key_name):
    """Check if payload[key_name] is extracted"""
    func_source = ast.get_source_segment(worker_source, func_node)
    if not func_source:
        return False
    # Look for patterns like: view_total = int(payload.get("view_total", 0) or 0)
    return key_name in func_source and f'payload.get("{key_name}"' in func_source

def check_function_call(func_node, target_func, param_name):
    """Check if target_func is called with param_name"""
    func_source = ast.get_source_segment(worker_source, func_node)
    if not func_source:
        return False
    # Look for the function call with the parameter
    return target_func in func_source and param_name in func_source

if handle_view:
    print("✓ Found handle_view_post function")
    
    # Check view_total extraction
    if check_payload_extraction(handle_view, "view_total"):
        print("  ✓ view_total extracted from payload")
    else:
        print("  ✗ FAIL: view_total not extracted from payload")
    
    # Check call to view_post_scheduled with view_total
    if check_function_call(handle_view, "view_post_scheduled", "view_total"):
        print("  ✓ view_post_scheduled called with view_total parameter")
    else:
        print("  ✗ FAIL: view_post_scheduled not called with view_total")
else:
    print("✗ FAIL: handle_view_post function not found")

if handle_react:
    print("✓ Found handle_react_post function")
    
    # Check react_total extraction
    if check_payload_extraction(handle_react, "react_total"):
        print("  ✓ react_total extracted from payload")
    else:
        print("  ✗ FAIL: react_total not extracted from payload")
    
    # Check call to react_post_scheduled with react_total
    if check_function_call(handle_react, "react_post_scheduled", "react_total"):
        print("  ✓ react_post_scheduled called with react_total parameter")
    else:
        print("  ✗ FAIL: react_post_scheduled not called with react_total")
else:
    print("✗ FAIL: handle_react_post function not found")

# ============================================================================
# TEST 4: Verify function signatures in userbot.py
# ============================================================================
print("\n" + "=" * 80)
print("[TEST 4] Verifying function signatures in userbot.py")
print("-" * 80)

userbot_path = Path(__file__).parent / "frontend" / "LS_Python" / "agent" / "userbot.py"
with open(userbot_path, 'r') as f:
    userbot_source = f.read()

userbot_ast = ast.parse(userbot_source, filename=str(userbot_path))

# Find view_post_scheduled and react_post_scheduled
view_sched = find_function(userbot_ast, "view_post_scheduled")
react_sched = find_function(userbot_ast, "react_post_scheduled")

def get_function_params(func_node):
    """Extract parameter names from function definition"""
    if not func_node:
        return []
    args = func_node.args
    params = []
    # Regular args
    for arg in args.args:
        params.append(arg.arg)
    return params

if view_sched:
    print("✓ Found view_post_scheduled function")
    params = get_function_params(view_sched)
    print(f"  Parameters: {params}")
    
    # Check for total_override parameter
    if "total_override" in params:
        print("  ✓ total_override parameter found")
        # Check position (should be last or near last)
        idx = params.index("total_override")
        print(f"  Parameter position: {idx + 1} of {len(params)}")
    else:
        print("  ✗ FAIL: total_override parameter not found")
    
    # Check default value
    func_source = ast.get_source_segment(userbot_source, view_sched)
    if func_source and "total_override: int = 0" in func_source:
        print("  ✓ total_override has default value of 0")
    else:
        print("  ⚠ WARNING: total_override default value not confirmed")
else:
    print("✗ FAIL: view_post_scheduled function not found")

if react_sched:
    print("✓ Found react_post_scheduled function")
    params = get_function_params(react_sched)
    print(f"  Parameters: {params}")
    
    # Check for total_override parameter
    if "total_override" in params:
        print("  ✓ total_override parameter found")
        # Check position
        idx = params.index("total_override")
        print(f"  Parameter position: {idx + 1} of {len(params)}")
    else:
        print("  ✗ FAIL: total_override parameter not found")
    
    # Check default value
    func_source = ast.get_source_segment(userbot_source, react_sched)
    if func_source and "total_override: int = 0" in func_source:
        print("  ✓ total_override has default value of 0")
    else:
        print("  ⚠ WARNING: total_override default value not confirmed")
else:
    print("✗ FAIL: react_post_scheduled function not found")

# ============================================================================
# TEST 5: Verify call site arity matches
# ============================================================================
print("\n" + "=" * 80)
print("[TEST 5] Verifying call site arity matches function signatures")
print("-" * 80)

# Count arguments in worker.py call sites
if handle_view:
    func_source = ast.get_source_segment(worker_source, handle_view)
    # Find the await userbot.view_post_scheduled(...) call
    for node in ast.walk(handle_view):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                if node.func.attr == "view_post_scheduled":
                    num_args = len(node.args)
                    num_kwargs = len(node.keywords)
                    print(f"✓ view_post_scheduled call site found")
                    print(f"  Positional args: {num_args}, Keyword args: {num_kwargs}")
                    print(f"  Total arguments: {num_args + num_kwargs}")
                    
                    # Check if view_total is passed
                    arg_names = [kw.arg for kw in node.keywords]
                    if "view_total" in arg_names or num_args >= 10:
                        print(f"  ✓ view_total appears to be passed (as arg #{num_args} or kwarg)")
                    else:
                        print(f"  ⚠ WARNING: view_total may not be passed")

if handle_react:
    func_source = ast.get_source_segment(worker_source, handle_react)
    # Find the await userbot.react_post_scheduled(...) call
    for node in ast.walk(handle_react):
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute):
                if node.func.attr == "react_post_scheduled":
                    num_args = len(node.args)
                    num_kwargs = len(node.keywords)
                    print(f"✓ react_post_scheduled call site found")
                    print(f"  Positional args: {num_args}, Keyword args: {num_kwargs}")
                    print(f"  Total arguments: {num_args + num_kwargs}")
                    
                    # Check if react_total is passed
                    arg_names = [kw.arg for kw in node.keywords]
                    if "react_total" in arg_names or num_args >= 11:
                        print(f"  ✓ react_total appears to be passed (as arg #{num_args} or kwarg)")
                    else:
                        print(f"  ⚠ WARNING: react_total may not be passed")

print("\n" + "=" * 80)
print("VERIFICATION COMPLETE")
print("=" * 80)
