"""Tokens an agent reads for one cycle: the exact text plan and ship printed (o200k_base tokenizer, offline)."""
import sys, tiktoken

enc = tiktoken.get_encoding("o200k_base")
total = 0
for path in sys.argv[1:]:
    n = len(enc.encode(open(path).read())); total += n
    print(f"{path.split('/')[-1]:<44} {n:>4} tokens")
print(f"{'full cycle (' + str(len(sys.argv) - 1) + ' CLI outputs, no HTML, no screenshots)':<44} {total:>4} tokens")
