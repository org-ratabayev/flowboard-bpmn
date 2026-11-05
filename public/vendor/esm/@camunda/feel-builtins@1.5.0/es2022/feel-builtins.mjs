/* esm.sh - @camunda/feel-builtins@1.5.0 */
var e=[{name:"not",type:"function",params:[{name:"negand"}],info:`<p>Returns the logical negation of the given value.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">not(negand: boolean): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">not(true)
// false

not(null)
// null
</code></pre>
`},{name:"get value",type:"function",params:[{name:"context"},{name:"key"}],info:`<p>Returns the value of the context entry with the given key.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">get value(context: context, key: string): Any
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">get value({foo: 123}, &quot;foo&quot;)
// 123

get value({a: 1}, &quot;b&quot;)
// null
</code></pre>
`},{name:"get entries",type:"function",params:[{name:"context"}],info:`<p>Returns the entries of the context as a list of key-value-pairs.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">get entries(context: context): list&lt;context&gt;
</code></pre>
<p>The return value is a list of contexts. Each context contains two entries for &quot;key&quot; and &quot;value&quot;.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">get entries({foo: 123})
// [{key: &quot;foo&quot;, value: 123}]
</code></pre>
`},{name:"context put",type:"function",params:[{name:"context"},{name:"keys"},{name:"value"}],info:`<p>Adds a new entry with the given value to the context. The path of the entry is defined by the keys. Returns a new context that includes the entry.</p>
<p>If <code>keys</code> contains the keys <code>[k1, k2]</code> then it adds the nested entry <code>k1.k2 = value</code> to the context.</p>
<p>If an entry for the same keys already exists in the context, it overrides the value.</p>
<p>If <code>keys</code> are empty, it returns <code>null</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">context put(context: context, keys: list&lt;string&gt;, value: Any): context
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">context put({x:1}, [&quot;y&quot;], 2)
// {x:1, y:2}

context put({x:1, y: {z:0}}, [&quot;y&quot;, &quot;z&quot;], 2)
// {x:1, y: {z:2}}

context put({x:1}, [&quot;y&quot;, &quot;z&quot;], 2)
// {x:1, y: {z:2}}
</code></pre>
`},{name:"string",type:"function",params:[{name:"from"}],info:`<p>Returns the given value as a string representation.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">string(from: Any): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">string(1.1)
// &quot;1.1&quot;

string(date(&quot;2012-12-25&quot;))
// &quot;2012-12-25&quot;
</code></pre>
`},{name:"number",type:"function",params:[{name:"from"}],info:`<p>Parses the given string to a number.</p>
<p>Returns <code>null</code> if the string is not a number.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">number(from: string): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">number(&quot;1500.5&quot;)
// 1500.5
</code></pre>
`},{name:"number",type:"function",params:[{name:"from"},{name:"grouping separator"}],info:`<p>Parses the given string to a number using the specified grouping separator.</p>
<p>Returns <code>null</code> if the string is not a number.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">number(from: string, grouping separator: string): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">number(&quot;1,500&quot;, &quot;,&quot;)
// 1500
</code></pre>
`},{name:"number",type:"function",params:[{name:"from"},{name:"grouping separator"},{name:"decimal separator"}],info:`<p>Parses the given string to a number using the specified grouping and decimal separators.</p>
<p>Returns <code>null</code> if the string is not a number.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">number(from: string, grouping separator: string, decimal separator: string): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">number(&quot;1 500.5&quot;, &quot; &quot;, &quot;.&quot;)
// 1500.5
</code></pre>
`},{name:"context",type:"function",params:[{name:"entries"}],info:`<p>Constructs a context of the given list of key-value pairs. It is the reverse function to <a href="https://docs.camunda.io/docs/components/modeler/feel/builtin-functions/feel-built-in-functions-context#get-entriescontext">get entries()</a>.</p>
<p>Each key-value pair must be a context with two entries: <code>key</code> and <code>value</code>. The entry with name <code>key</code> must have a value of the type <code>string</code>.</p>
<p>It might override context entries if the keys are equal. The entries are overridden in the same order as the contexts in the given list.</p>
<p>Returns <code>null</code> if one of the entries is not a context or if a context doesn&#39;t contain the required entries.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">context(entries: list&lt;context&gt;): context
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">context([{&quot;key&quot;:&quot;a&quot;, &quot;value&quot;:1}, {&quot;key&quot;:&quot;b&quot;, &quot;value&quot;:2}])
// {a:1, b:2}
</code></pre>
`},{name:"date",type:"function",params:[{name:"from"}],info:`<p>Returns a date from the given value.</p>
<p>Returns <code>null</code> if the string is not a valid calendar date. For example, <code>&quot;2024-06-31&quot;</code> is invalid because June has
only 30 days.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">date(from: string): date
</code></pre>
<p>Parses the given string into a date.</p>
<pre><code class="language-feel">date(from: date and time): date
</code></pre>
<p>Extracts the date component from the given date and time.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">date(&quot;2018-04-29&quot;)
// date(&quot;2018-04-29&quot;)

date(date and time(&quot;2012-12-25T11:00:00&quot;))
// date(&quot;2012-12-25&quot;)
</code></pre>
`},{name:"date",type:"function",params:[{name:"year"},{name:"month"},{name:"day"}],info:`<p>Returns a date from the given components.</p>
<p>Returns <code>null</code> if the components don&#39;t represent a valid calendar date. For example, <code>2024,6,31</code> is invalid because
June has only 30 days.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">date(year: number, month: number, day: number): date
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">date(2012, 12, 25)
// date(&quot;2012-12-25&quot;)
</code></pre>
`},{name:"time",type:"function",params:[{name:"from"}],info:`<p>Returns a time from the given value.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">time(from: string): time
</code></pre>
<p>Parses the given string into a time.</p>
<pre><code class="language-feel">time(from: date and time): time
</code></pre>
<p>Extracts the time component from the given date and time.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">time(&quot;12:00:00&quot;)
// time(&quot;12:00:00&quot;)

time(date and time(&quot;2012-12-25T11:00:00&quot;))
// time(&quot;11:00:00&quot;)
</code></pre>
`},{name:"time",type:"function",params:[{name:"hour"},{name:"minute"},{name:"second"}],info:`<p>Returns a time from the given components.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">time(hour: number, minute: number, second: number): time
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">time(23, 59, 0)
// time(&quot;23:59:00&quot;)
</code></pre>
`},{name:"time",type:"function",params:[{name:"hour"},{name:"minute"},{name:"second"},{name:"offset"}],info:`<p>Returns a time from the given components, including a timezone offset.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">time(hour: number, minute: number, second: number, offset: days and time duration): time
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">time(14, 30, 0, duration(&quot;PT1H&quot;))
// time(&quot;14:30:00+01:00&quot;)
</code></pre>
`},{name:"date and time",type:"function",params:[{name:"from"}],info:`<p>Parses the given string into a date and time. The function supports strings in the format <code>YYYY-MM-DDThh:mm:ss</code> with
optional timezone information either as offset (e.g., <code>+01:00</code> or <code>Z</code>), as IANA timezone ID (e.g., <code>@Europe/Berlin</code>), or
as a combination of both (e.g., <code>+01:00[Europe/Berlin]</code>).</p>
<p>Returns <code>null</code> if the string is not a valid calendar date. For example, <code>&quot;2024-06-31T10:00:00&quot;</code> is invalid because
June has only 30 days.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">date and time(from: string): date and time
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">date and time(&quot;2018-04-29T09:30:00&quot;)
// date and time(&quot;2018-04-29T09:30:00&quot;)

date and time(&quot;2018-04-29T09:30:00+02:00&quot;)
// date and time(&quot;2018-04-29T09:30:00+02:00&quot;)

date and time(&quot;2018-04-29T09:30:00@Europe/Berlin&quot;)
// date and time(&quot;2018-04-29T09:30:00@Europe/Berlin&quot;)

date and time(&quot;2018-04-29T09:30:00+02:00[Europe/Berlin]&quot;)
// date and time(&quot;2018-04-29T09:30:00@Europe/Berlin&quot;)
</code></pre>
`},{name:"date and time",type:"function",params:[{name:"date"},{name:"time"}],info:`<p>Returns a date and time from the given components.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">date and time(date: date, time: time): date and time
</code></pre>
<pre><code class="language-feel">date and time(date: date and time, time: time): date and time
</code></pre>
<p>Returns a date and time value that consists of the date component of <code>date</code> combined with <code>time</code>.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">date and time(date(&quot;2012-12-24&quot;),time(&quot;T23:59:00&quot;))
// date and time(&quot;2012-12-24T23:59:00&quot;)

date and time(date and time(&quot;2012-12-25T11:00:00&quot;),time(&quot;T23:59:00&quot;))
// date and time(&quot;2012-12-25T23:59:00&quot;)
</code></pre>
`},{name:"duration",type:"function",params:[{name:"from"}],info:`<p>Parses the given string into a duration. The duration is either a days and time duration or a years and months duration.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">duration(from: string): days and time duration
</code></pre>
<pre><code class="language-feel">duration(from: string): years and months duration
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">duration(&quot;P5D&quot;)
// duration(&quot;P5D&quot;)

duration(&quot;P32Y&quot;)
// duration(&quot;P32Y&quot;)
</code></pre>
`},{name:"years and months duration",type:"function",params:[{name:"from"},{name:"to"}],info:`<p>Returns the years and months duration between <code>from</code> and <code>to</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">years and months duration(from: date, to: date): years and months duration
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">years and months duration(date(&quot;2011-12-22&quot;), date(&quot;2013-08-24&quot;))
// duration(&quot;P1Y8M&quot;)
</code></pre>
`},{name:"from json",type:"function",params:[{name:"value"}],info:`<p>Parses a JSON string into a FEEL value. The function converts JSON primitives, objects, and arrays into their corresponding FEEL types.</p>
<p>Returns <code>null</code> if the string is not a valid JSON value.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">from json(value: string): Any
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">from json(&quot;{\\&quot;a\\&quot;: 1, \\&quot;b\\&quot;: 2}&quot;)
// {a: 1, b: 2}

from json(&quot;true&quot;)
// true

from json(&quot;\\&quot;2023-06-14\\&quot;&quot;)
// &quot;2023-06-14&quot;
</code></pre>
`,engines:{camunda:">=8.9"}},{name:"to json",type:"function",params:[{name:"value"}],info:`<p>Converts a FEEL value into a JSON string. The function converts FEEL primitives, contexts, and lists into their
corresponding JSON types. Temporal values are converted to their ISO 8601 string representation, including timezone
information for date and time values (format: <code>2025-11-24T10:00:00+01:00[Europe/Berlin]</code>).</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">to json(value: Any): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">to json({a: 1, b: 2})
// &quot;{\\&quot;a\\&quot;:1,\\&quot;b\\&quot;:2}&quot;

to json(true)
// &quot;true&quot;

to json(@&quot;2023-06-14&quot;)
// &quot;\\&quot;2023-06-14\\&quot;&quot;

to json(@&quot;2025-11-24T10:00:00@Europe/Berlin&quot;)
// &quot;\\&quot;2025-11-24T10:00:00+01:00[Europe/Berlin]\\&quot;&quot;

to json(@&quot;P3Y&quot;)
// &quot;\\&quot;P3Y\\&quot;&quot;
</code></pre>
`,engines:{camunda:">=8.9"}},{name:"list contains",type:"function",params:[{name:"list"},{name:"element"}],info:`<p>Returns <code>true</code> if the given list contains the element. Otherwise, returns <code>false</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">list contains(list: list, element: Any): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">list contains([1,2,3], 2)
// true
</code></pre>
`},{name:"count",type:"function",params:[{name:"list"}],info:`<p>Returns the number of elements of the given list.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">count(list: list): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">count([1,2,3])
// 3
</code></pre>
`},{name:"min",type:"function",params:[{name:"list"}],info:`<p>Returns the minimum of the given list.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">min(list: list): Any
</code></pre>
<p>All elements in <code>list</code> should have the same type and be comparable.</p>
<p>The parameter <code>list</code> can be passed as a list or as a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">min([1,2,3])
// 1

min(1,2,3)
// 1
</code></pre>
`},{name:"max",type:"function",params:[{name:"list"}],info:`<p>Returns the maximum of the given list.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">max(list: list): Any
</code></pre>
<p>All elements in <code>list</code> should have the same type and be comparable.</p>
<p>The parameter <code>list</code> can be passed as a list or as a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">max([1,2,3])
// 3

max(1,2,3)
// 3
</code></pre>
`},{name:"sum",type:"function",params:[{name:"list"}],info:`<p>Returns the sum of the given list of numbers.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">sum(list: list&lt;number&gt;): number
</code></pre>
<p>The parameter <code>list</code> can be passed as a list or as a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">sum([1,2,3])
// 6

sum(1,2,3)
// 6
</code></pre>
`},{name:"product",type:"function",params:[{name:"list"}],info:`<p>Returns the product of the given list of numbers.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">product(list: list&lt;number&gt;): number
</code></pre>
<p>The parameter <code>list</code> can be passed as a list or as a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">product([2, 3, 4])
// 24

product(2, 3, 4)
// 24
</code></pre>
`},{name:"mean",type:"function",params:[{name:"list"}],info:`<p>Returns the arithmetic mean (i.e. average) of the given list of numbers.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">mean(list: list&lt;number&gt;): number
</code></pre>
<p>The parameter <code>list</code> can be passed as a list or as a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">mean([1,2,3])
// 2

mean(1,2,3)
// 2
</code></pre>
`},{name:"median",type:"function",params:[{name:"list"}],info:`<p>Returns the median element of the given list of numbers.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">median(list: list&lt;number&gt;): number
</code></pre>
<p>The parameter <code>list</code> can be passed as a list or as a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">median(8, 2, 5, 3, 4)
// 4

median([6, 1, 2, 3])
// 2.5
</code></pre>
`},{name:"stddev",type:"function",params:[{name:"list"}],info:`<p>Returns the standard deviation of the given list of numbers.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">stddev(list: list&lt;number&gt;): number
</code></pre>
<p>The parameter <code>list</code> can be passed as a list or as a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">stddev(2, 4, 7, 5)
// 2.0816659994661326

stddev([2, 4, 7, 5])
// 2.0816659994661326
</code></pre>
`},{name:"mode",type:"function",params:[{name:"list"}],info:`<p>Returns the mode of the given list of numbers.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">mode(list: list&lt;number&gt;): number
</code></pre>
<p>The parameter <code>list</code> can be passed as a list or as a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">mode(6, 3, 9, 6, 6)
// [6]

mode([6, 1, 9, 6, 1])
// [1, 6]
</code></pre>
`},{name:"all",type:"function",params:[{name:"list"}],info:`<p>Returns <code>false</code> if any element of the given list is <code>false</code>. Otherwise, returns <code>true</code>.</p>
<p>If the given list is empty, it returns <code>true</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">all(list: list&lt;boolean&gt;): boolean
</code></pre>
<p>The parameter <code>list</code> can be passed as a list or as a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">all([true,false])
// false

all(false,null,true)
// false
</code></pre>
<p>:::info
The function <code>all()</code> replaced the previous function <code>and()</code>. The previous function is deprecated and
should not be used anymore.
:::</p>
`},{name:"any",type:"function",params:[{name:"list"}],info:`<p>Returns <code>true</code> if any element of the given list is <code>true</code>. Otherwise, returns <code>false</code>.</p>
<p>If the given list is empty, it returns <code>false</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">any(list: list&lt;boolean&gt;): boolean
</code></pre>
<p>The parameter <code>list</code> can be passed as a list or as a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">any([false,true])
// true

any(false,null,true)
// true
</code></pre>
<p>:::info
The function <code>any()</code> replaced the previous function <code>or()</code>. The previous function is deprecated and
should not be used anymore.
:::</p>
`},{name:"sublist",type:"function",params:[{name:"list"},{name:"start position"}],info:`<p>Returns a partial list of the given value starting at <code>start position</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">sublist(list: list, start position: number): list
</code></pre>
<p>The <code>start position</code> starts at the index <code>1</code>. The last position is <code>-1</code>.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">sublist([1,2,3], 2)
// [2,3]
</code></pre>
`},{name:"sublist",type:"function",params:[{name:"list"},{name:"start position"},{name:"length"}],info:`<p>Returns a partial list of the given value starting at <code>start position</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">sublist(list: list, start position: number, length: number): list
</code></pre>
<p>The <code>start position</code> starts at the index <code>1</code>. The last position is <code>-1</code>.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">sublist([1,2,3], 1, 2)
// [1,2]
</code></pre>
`},{name:"append",type:"function",params:[{name:"list"},{name:"items"}],info:`<p>Returns the given list with all <code>items</code> appended.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">append(list: list, items: Any): list
</code></pre>
<p>The parameter <code>items</code> can be a single element or a sequence of elements.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">append([1], 2, 3)
// [1,2,3]
</code></pre>
`},{name:"concatenate",type:"function",params:[{name:"lists"}],info:`<p>Returns a list that includes all elements of the given lists.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">concatenate(lists: list): list
</code></pre>
<p>The parameter <code>lists</code> is a sequence of lists.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">concatenate([1,2],[3])
// [1,2,3]

concatenate([1],[2],[3])
// [1,2,3]
</code></pre>
`},{name:"insert before",type:"function",params:[{name:"list"},{name:"position"},{name:"newItem"}],info:`<p>Returns the given list with <code>newItem</code> inserted at <code>position</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">insert before(list: list, position: number, newItem: Any): list
</code></pre>
<p>The <code>position</code> starts at the index <code>1</code>. The last position is <code>-1</code>.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">insert before([1,3],1,2)
// [2,1,3]
</code></pre>
`},{name:"remove",type:"function",params:[{name:"list"},{name:"position"}],info:`<p>Returns the given list without the element at <code>position</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">remove(list: list, position: number): list
</code></pre>
<p>The <code>position</code> starts at the index <code>1</code>. The last position is <code>-1</code>.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">remove([1,2,3], 2)
// [1,3]
</code></pre>
`},{name:"reverse",type:"function",params:[{name:"list"}],info:`<p>Returns the given list in revered order.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">reverse(list: list): list
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">reverse([1,2,3])
// [3,2,1]
</code></pre>
`},{name:"index of",type:"function",params:[{name:"list"},{name:"match"}],info:`<p>Returns an ascending list of positions containing <code>match</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">index of(list: list, match: Any): list&lt;number&gt;
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">index of([1,2,3,2],2)
// [2,4]
</code></pre>
`},{name:"union",type:"function",params:[{name:"list"}],info:`<p>Returns a list that includes all elements of the given lists without duplicates.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">union(list: list): list
</code></pre>
<p>The parameter <code>list</code> is a sequence of lists.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">union([1,2],[2,3])
// [1,2,3]
</code></pre>
`},{name:"distinct values",type:"function",params:[{name:"list"}],info:`<p>Returns the given list without duplicates.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">distinct values(list: list): list
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">distinct values([1,2,3,2,1])
// [1,2,3]
</code></pre>
`},{name:"flatten",type:"function",params:[{name:"list"}],info:`<p>Returns a list that includes all elements of the given list without nested lists.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">flatten(list: list): list
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">flatten([[1,2],[[3]], 4])
// [1,2,3,4]
</code></pre>
`},{name:"sort",type:"function",params:[{name:"list"},{name:"precedes"}],info:`<p>Returns the given list sorted by the <code>precedes</code> function.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">sort(list: list, precedes: function&lt;(Any, Any) -&gt; boolean&gt;): list
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">sort(list: [3,1,4,5,2], precedes: function(x,y) x &lt; y)
// [1,2,3,4,5]
</code></pre>
`},{name:"string join",type:"function",params:[{name:"list"}],info:`<p>Joins a list of strings into a single string. This is similar to
Java&#39;s <a href="https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/stream/Collectors.html#joining(java.lang.CharSequence,java.lang.CharSequence,java.lang.CharSequence)">joining</a>
function.</p>
<p>If an item of the list is <code>null</code>, the item is ignored for the result string. If an item is
neither a string nor <code>null</code>, the function returns <code>null</code> instead of a string.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">string join(list: list&lt;string&gt;): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">string join([&quot;a&quot;,&quot;b&quot;,&quot;c&quot;])
// &quot;abc&quot;

string join([&quot;a&quot;,null,&quot;c&quot;])
// &quot;ac&quot;

string join([])
// &quot;&quot;
</code></pre>
`},{name:"string join",type:"function",params:[{name:"list"},{name:"delimiter"}],info:`<p>Joins a list of strings into a single string. This is similar to
Java&#39;s <a href="https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/stream/Collectors.html#joining(java.lang.CharSequence,java.lang.CharSequence,java.lang.CharSequence)">joining</a>
function.</p>
<p>If an item of the list is <code>null</code>, the item is ignored for the result string. If an item is
neither a string nor <code>null</code>, the function returns <code>null</code> instead of a string.</p>
<p>The resulting string contains a <code>delimiter</code> between each element.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">string join(list: list&lt;string&gt;, delimiter: string): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">string join([&quot;a&quot;], &quot;X&quot;)
// &quot;a&quot;

string join([&quot;a&quot;,&quot;b&quot;,&quot;c&quot;], &quot;, &quot;)
// &quot;a, b, c&quot;
</code></pre>
`},{name:"decimal",type:"function",params:[{name:"n"},{name:"scale"}],info:`<p>Rounds the given value at the given scale.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">decimal(n: number, scale: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">decimal(1/3, 2)
// .33

decimal(1.5, 0)
// 2
</code></pre>
`},{name:"floor",type:"function",params:[{name:"n"}],info:`<p>Rounds the given value with rounding mode flooring.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">floor(n: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">floor(1.5)
// 1

floor(-1.5)
// -2
</code></pre>
`},{name:"floor",type:"function",params:[{name:"n"},{name:"scale"}],info:`<p>Rounds the given value with rounding mode flooring at the given scale.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">floor(n: number, scale: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">floor(-1.56, 1)
// -1.6
</code></pre>
`},{name:"ceiling",type:"function",params:[{name:"n"}],info:`<p>Rounds the given value with rounding mode ceiling.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">ceiling(n: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">ceiling(1.5)
// 2

ceiling(-1.5)
// -1
</code></pre>
`},{name:"ceiling",type:"function",params:[{name:"n"},{name:"scale"}],info:`<p>Rounds the given value with rounding mode ceiling at the given scale.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">ceiling(n: number, scale: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">ceiling(-1.56, 1)
// -1.5
</code></pre>
`},{name:"round up",type:"function",params:[{name:"n"},{name:"scale"}],info:`<p>Rounds the given value with the rounding mode round-up at the given scale.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">round up(n: number, scale: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">round up(5.5)
// 6

round up(-5.5)
// -6

round up(1.121, 2)
// 1.13

round up(-1.126, 2)
// -1.13
</code></pre>
`},{name:"round down",type:"function",params:[{name:"n"},{name:"scale"}],info:`<p>Rounds the given value with the rounding mode round-down at the given scale.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">round down(n: number, scale: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">round down(5.5, 0)
// 5

round down (-5.5, 0)
// -5

round down (1.121, 2)
// 1.12

round down (-1.126, 2)
// -1.12
</code></pre>
`},{name:"round half up",type:"function",params:[{name:"n"},{name:"scale"}],info:`<p>Rounds the given value with the rounding mode round-half-up at the given scale.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">round half up(n: number, scale: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">round half up(5.5, 0)
// 6

round half up(-5.5, 0)
// -6

round half up(1.121, 2)
// 1.12

round half up(-1.126, 2)
// -1.13
</code></pre>
`},{name:"round half down",type:"function",params:[{name:"n"},{name:"scale"}],info:`<p>Rounds the given value with the rounding mode round-half-down at the given scale.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">round half down(n: number, scale: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">round half down (5.5, 0)
// 5

round half down (-5.5, 0)
// -5

round half down (1.121, 2)
// 1.12

round half down (-1.126, 2)
// -1.13
</code></pre>
`},{name:"abs",type:"function",params:[{name:"number"}],info:`<p>Returns the absolute value of the given numeric value.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">abs(number: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">abs(10)
// 10

abs(-10)
// 10
</code></pre>
`},{name:"modulo",type:"function",params:[{name:"dividend"},{name:"divisor"}],info:`<p>Returns the remainder of the division of dividend by divisor.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">modulo(dividend: number, divisor: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">modulo(12, 5)
// 2
</code></pre>
`},{name:"sqrt",type:"function",params:[{name:"number"}],info:`<p>Returns the square root of the given value.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">sqrt(number: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">sqrt(16)
// 4
</code></pre>
`},{name:"log",type:"function",params:[{name:"number"}],info:`<p>Returns the natural logarithm (base e) of the given value.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">log(number: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">log(10)
// 2.302585092994046
</code></pre>
`},{name:"exp",type:"function",params:[{name:"number"}],info:`<p>Returns the Euler\u2019s number e raised to the power of the given number .</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">exp(number: number): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">exp(5)
// 148.4131591025766
</code></pre>
`},{name:"odd",type:"function",params:[{name:"number"}],info:`<p>Returns <code>true</code> if the given value is odd. Otherwise, returns <code>false</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">odd(number: number): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">odd(5)
// true

odd(2)
// false
</code></pre>
`},{name:"even",type:"function",params:[{name:"number"}],info:`<p>Returns <code>true</code> if the given is even. Otherwise, returns <code>false</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">even(number: number): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">even(5)
// false

even(2)
// true
</code></pre>
`},{name:"before",type:"function",params:[{name:"point1"},{name:"point2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">before(point1: Any, point2: Any): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">before(1, 10)
// true

before(10, 1)
// false
</code></pre>
`},{name:"before",type:"function",params:[{name:"range"},{name:"point"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">before(range: range, point: Any): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">before([1..5], 10)
// true
</code></pre>
`},{name:"before",type:"function",params:[{name:"point"},{name:"range"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">before(point: Any, range: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">before(1, [2..5])
// true
</code></pre>
`},{name:"before",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">before(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">before([1..5], [6..10])
// true

before([1..5),[5..10])
// true
</code></pre>
`},{name:"after",type:"function",params:[{name:"point1"},{name:"point2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">after(point1: Any, point2: Any): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">after(10, 1)
// true

after(1, 10)
// false
</code></pre>
`},{name:"after",type:"function",params:[{name:"range"},{name:"point"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">after(range: range, point: Any): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">after([1..5], 10)
// false
</code></pre>
`},{name:"after",type:"function",params:[{name:"point"},{name:"range"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">after(point: Any, range: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">after(12, [2..5])
// true
</code></pre>
`},{name:"after",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">after(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">after([6..10], [1..5])
// true

after([5..10], [1..5))
// true
</code></pre>
`},{name:"meets",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">meets(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">meets([1..5], [5..10])
// true

meets([1..3], [4..6])
// false

meets([1..3], [3..5])
// true

meets([1..5], (5..8])
// false
</code></pre>
`},{name:"met by",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">met by(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">met by([5..10], [1..5])
// true

met by([3..4], [1..2])
// false

met by([3..5], [1..3])
// true

met by((5..8], [1..5))
// false

met by([5..10], [1..5))
// false
</code></pre>
`},{name:"overlaps",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">overlaps(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">overlaps([5..10], [1..6])
// true

overlaps((3..7], [1..4])
// true

overlaps([1..3], (3..6])
// false

overlaps((5..8], [1..5))
// false

overlaps([4..10], [1..5))
// true
</code></pre>
`},{name:"overlaps before",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">overlaps before(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">overlaps before([1..5], [4..10])
// true

overlaps before([3..4], [1..2])
// false

overlaps before([1..3], (3..5])
// false

overlaps before([1..5), (3..8])
// true

overlaps before([1..5), [5..10])
// false
</code></pre>
`},{name:"overlaps after",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">overlaps after(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">overlaps after([4..10], [1..5])
// true

overlaps after([3..4], [1..2])
// false

overlaps after([3..5], [1..3))
// false

overlaps after((5..8], [1..5))
// false

overlaps after([4..10], [1..5))
// true
</code></pre>
`},{name:"finishes",type:"function",params:[{name:"point"},{name:"range"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">finishes(point: Any, range: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">finishes(5, [1..5])
// true

finishes(10, [1..7])
// false
</code></pre>
`},{name:"finishes",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">finishes(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">finishes([3..5], [1..5])
// true

finishes((1..5], [1..5))
// false

finishes([5..10], [1..10))
// false
</code></pre>
`},{name:"finished by",type:"function",params:[{name:"range"},{name:"point"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">finished by(range: range, point: Any): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">finished by([5..10], 10)
// true

finished by([3..4], 2)
// false
</code></pre>
`},{name:"finished by",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">finished by(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">finished by([1..5], [3..5])
// true

finished by((5..8], [1..5))
// false

finished by([5..10], (1..10))
// false
</code></pre>
`},{name:"includes",type:"function",params:[{name:"range"},{name:"point"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">includes(range: range, point: Any): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">includes([5..10], 6)
// true

includes([3..4], 5)
// false
</code></pre>
`},{name:"includes",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">includes(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">includes([1..10], [4..6])
// true

includes((5..8], [1..5))
// false

includes([1..10], [1..5))
// true
</code></pre>
`},{name:"during",type:"function",params:[{name:"point"},{name:"range"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">during(point: Any, range: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">during(5, [1..10])
// true

during(12, [1..10])
// false

during(1, (1..10])
// false
</code></pre>
`},{name:"during",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">during(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">during([4..6], [1..10))
// true

during((1..5], (1..10])
// true
</code></pre>
`},{name:"starts",type:"function",params:[{name:"point"},{name:"range"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">starts(point: Any, range: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">starts(1, [1..5])
// true

starts(1, (1..8])
// false
</code></pre>
`},{name:"starts",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">starts(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">starts((1..5], [1..5])
// false

starts([1..10], [1..5])
// false

starts((1..5), (1..10))
// true
</code></pre>
`},{name:"started by",type:"function",params:[{name:"range"},{name:"point"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">started by(range: range, point: Any): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">started by([1..10], 1)
// true

started by((1..10], 1)
// false
</code></pre>
`},{name:"started by",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">started by(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">started by([1..10], [1..5])
// true

started by((1..10], [1..5))
// false

started by([1..10], [1..10))
// true
</code></pre>
`},{name:"coincides",type:"function",params:[{name:"point1"},{name:"point2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">coincides(point1: Any, point2: Any): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">coincides(5, 5)
// true

coincides(3, 4)
// false
</code></pre>
`},{name:"coincides",type:"function",params:[{name:"range1"},{name:"range2"}],info:`<p><strong>Function signature</strong></p>
<pre><code class="language-feel">coincides(range1: range, range2: range): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">coincides([1..5], [1..5])
// true

coincides((1..5], [1..5))
// false

coincides([1..5], [2..6])
// false
</code></pre>
`},{name:"substring",type:"function",params:[{name:"string"},{name:"start position"}],info:`<p>Returns a substring of the given value starting at <code>start position</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">substring(string: string, start position: number): string
</code></pre>
<p>The <code>start position</code> starts at the index <code>1</code>. The last position is <code>-1</code>.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">substring(&quot;foobar&quot;, 3)
// &quot;obar&quot;

substring(&quot;foobar&quot;, -2)
// &quot;ar&quot;
</code></pre>
`},{name:"substring",type:"function",params:[{name:"string"},{name:"start position"},{name:"length"}],info:`<p>Returns a substring of the given value, starting at <code>start position</code> with the given <code>length</code>. If <code>length</code> is greater than
the remaining characters of the value, it returns all characters from <code>start position</code> until the end.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">substring(string: string, start position: number, length: number): string
</code></pre>
<p>The <code>start position</code> starts at the index <code>1</code>. The last position is <code>-1</code>.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">substring(&quot;foobar&quot;, 3, 3)
// &quot;oba&quot;

substring(&quot;foobar&quot;, -3, 2)
// &quot;ba&quot;

substring(&quot;foobar&quot;, 3, 10)
// &quot;obar&quot;
</code></pre>
`},{name:"string length",type:"function",params:[{name:"string"}],info:`<p>Returns the number of characters in the given value.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">string length(string: string): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">string length(&quot;foo&quot;)
// 3
</code></pre>
`},{name:"upper case",type:"function",params:[{name:"string"}],info:`<p>Returns the given value with all characters are uppercase.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">upper case(string: string): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">upper case(&quot;aBc4&quot;)
// &quot;ABC4&quot;
</code></pre>
`},{name:"lower case",type:"function",params:[{name:"string"}],info:`<p>Returns the given value with all characters are lowercase.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">lower case(string: string): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">lower case(&quot;aBc4&quot;)
// &quot;abc4&quot;
</code></pre>
`},{name:"substring before",type:"function",params:[{name:"string"},{name:"match"}],info:`<p>Returns a substring of the given value that contains all characters before <code>match</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">substring before(string: string, match: string): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">substring before(&quot;foobar&quot;, &quot;bar&quot;)
// &quot;foo&quot;
</code></pre>
`},{name:"substring after",type:"function",params:[{name:"string"},{name:"match"}],info:`<p>Returns a substring of the given value that contains all characters after <code>match</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">substring after(string: string, match: string): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">substring after(&quot;foobar&quot;, &quot;ob&quot;)
// &quot;ar&quot;
</code></pre>
`},{name:"contains",type:"function",params:[{name:"string"},{name:"match"}],info:`<p>Returns <code>true</code> if the given value contains the substring <code>match</code>. Otherwise, returns <code>false</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">contains(string: string, match: string): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">contains(&quot;foobar&quot;, &quot;of&quot;)
// false
</code></pre>
`},{name:"starts with",type:"function",params:[{name:"string"},{name:"match"}],info:`<p>Returns <code>true</code> if the given value starts with the substring <code>match</code>. Otherwise, returns <code>false</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">starts with(string: string, match: string): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">starts with(&quot;foobar&quot;, &quot;fo&quot;)
// true
</code></pre>
`},{name:"ends with",type:"function",params:[{name:"string"},{name:"match"}],info:`<p>Returns <code>true</code> if the given value ends with the substring <code>match</code>. Otherwise, returns <code>false</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">ends with(string: string, match: string): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">ends with(&quot;foobar&quot;, &quot;r&quot;)
// true
</code></pre>
`},{name:"matches",type:"function",params:[{name:"input"},{name:"pattern"}],info:`<p>Returns <code>true</code> if the given value matches the <code>pattern</code>. Otherwise, returns <code>false</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">matches(input: string, pattern: string): boolean
</code></pre>
<p>The <code>pattern</code> is a string that contains a regular expression.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">matches(&quot;foobar&quot;, &quot;^fo*bar&quot;)
// true
</code></pre>
`},{name:"matches",type:"function",params:[{name:"input"},{name:"pattern"},{name:"flags"}],info:`<p>Returns <code>true</code> if the given value matches the <code>pattern</code>. Otherwise, returns <code>false</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">matches(input: string, pattern: string, flags: string): boolean
</code></pre>
<p>The <code>pattern</code> is a string that contains a regular expression.</p>
<p>The <code>flags</code> can contain one or more of the following characters:</p>
<ul>
<li><code>s</code> (dot-all)</li>
<li><code>m</code> (multi-line)</li>
<li><code>i</code> (case insensitive)</li>
<li><code>x</code> (comments)</li>
</ul>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">matches(&quot;FooBar&quot;, &quot;foo&quot;, &quot;i&quot;)
// true
</code></pre>
`},{name:"replace",type:"function",params:[{name:"input"},{name:"pattern"},{name:"replacement"}],info:`<p>Returns the resulting string after replacing all occurrences of <code>pattern</code> with <code>replacement</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">replace(input: string, pattern: string, replacement: string): string
</code></pre>
<p>The <code>pattern</code> is a string that contains a regular expression.</p>
<p>The <code>replacement</code> can access the match groups by using <code>$</code> and the number of the group, for example,
<code>$1</code> to access the first group.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">replace(&quot;abcd&quot;, &quot;(ab)|(a)&quot;, &quot;[1=$1][2=$2]&quot;)
// &quot;[1=ab][2=]cd&quot;

replace(&quot;0123456789&quot;, &quot;(\\d{3})(\\d{3})(\\d{4})&quot;, &quot;($1) $2-$3&quot;)
// &quot;(012) 345-6789&quot;
</code></pre>
`},{name:"replace",type:"function",params:[{name:"input"},{name:"pattern"},{name:"replacement"},{name:"flags"}],info:`<p>Returns the resulting string after replacing all occurrences of <code>pattern</code> with <code>replacement</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">replace(input: string, pattern: string, replacement: string, flags: string): string
</code></pre>
<p>The <code>pattern</code> is a string that contains a regular expression.</p>
<p>The <code>replacement</code> can access the match groups by using <code>$</code> and the number of the group, for example,
<code>$1</code> to access the first group.</p>
<p>The <code>flags</code> can contain one or more of the following characters:</p>
<ul>
<li><code>s</code> (dot-all)</li>
<li><code>m</code> (multi-line)</li>
<li><code>i</code> (case insensitive)</li>
<li><code>x</code> (comments)</li>
</ul>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">replace(&quot;How do you feel?&quot;, &quot;Feel&quot;, &quot;FEEL&quot;, &quot;i&quot;)
// &quot;How do you FEEL?&quot;
</code></pre>
`},{name:"split",type:"function",params:[{name:"string"},{name:"delimiter"}],info:`<p>Splits the given value into a list of substrings, breaking at each occurrence of the <code>delimiter</code> pattern.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">split(string: string, delimiter: string): list&lt;string&gt;
</code></pre>
<p>The <code>delimiter</code> is a string that contains a regular expression.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">split(&quot;John Doe&quot;, &quot;\\s&quot; )
// [&quot;John&quot;, &quot;Doe&quot;]

split(&quot;a;b;c;;&quot;, &quot;;&quot;)
// [&quot;a&quot;, &quot;b&quot;, &quot;c&quot;, &quot;&quot;, &quot;&quot;]
</code></pre>
`},{name:"now",type:"function",params:[],info:`<p>Returns the current date and time including the timezone.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">now(): date and time
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">now()
// date and time(&quot;2020-07-31T14:27:30@Europe/Berlin&quot;)
</code></pre>
<p>In Camunda, <code>now()</code> uses the default time zone of the cluster. FEEL shows the zone ID after <code>@</code>, for example <code>@Europe/Berlin</code>. If you store the result in a variable, the zone ID is written in brackets after the offset instead, for example <code>2026-09-29T12:31:01.641Z[GMT]</code>, which some ISO 8601 parsers reject. To store the value without the zone ID, convert it to a fixed offset. See <a href="https://docs.camunda.io/components/concepts/variables#variable-values">variable values</a>.</p>
<pre><code class="language-feel">date and time(now(), &quot;Z&quot;)
// date and time(&quot;2020-07-31T12:27:30Z&quot;)
</code></pre>
`},{name:"today",type:"function",params:[],info:`<p>Returns the current date.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">today(): date
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">today()
// date(&quot;2020-07-31&quot;)
</code></pre>
`},{name:"day of week",type:"function",params:[{name:"date"}],info:`<p>Returns the day of the week according to the Gregorian calendar. Note that it always returns the English name of the day.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">day of week(date: date): string
</code></pre>
<pre><code class="language-feel">day of week(date: date and time): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">day of week(date(&quot;2019-09-17&quot;))
// &quot;Tuesday&quot;

day of week(date and time(&quot;2019-09-17T12:00:00&quot;))
// &quot;Tuesday&quot;
</code></pre>
`},{name:"day of year",type:"function",params:[{name:"date"}],info:`<p>Returns the Gregorian number of the day within the year.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">day of year(date: date): number
</code></pre>
<pre><code class="language-feel">day of year(date: date and time): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">day of year(date(&quot;2019-09-17&quot;))
// 260

day of year(date and time(&quot;2019-09-17T12:00:00&quot;))
// 260
</code></pre>
`},{name:"week of year",type:"function",params:[{name:"date"}],info:`<p>Returns the Gregorian number of the week within the year, according to ISO 8601.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">week of year(date: date): number
</code></pre>
<pre><code class="language-feel">week of year(date: date and time): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">week of year(date(&quot;2019-09-17&quot;))
// 38

week of year(date and time(&quot;2019-09-17T12:00:00&quot;))
// 38
</code></pre>
`},{name:"month of year",type:"function",params:[{name:"date"}],info:`<p>Returns the month of the year according to the Gregorian calendar. Note that it always returns the English name of the month.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">month of year(date: date): string
</code></pre>
<pre><code class="language-feel">month of year(date: date and time): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">month of year(date(&quot;2019-09-17&quot;))
// &quot;September&quot;

month of year(date and time(&quot;2019-09-17T12:00:00&quot;))
// &quot;September&quot;
</code></pre>
`},{name:"abs",type:"function",params:[{name:"n"}],info:`<p>Returns the absolute value of a given duration.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">abs(n: days and time duration): days and time duration
</code></pre>
<pre><code class="language-feel">abs(n: years and months duration): years and months duration
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">abs(duration(&quot;-PT5H&quot;))
// &quot;duration(&quot;PT5H&quot;)&quot;

abs(duration(&quot;PT5H&quot;))
// &quot;duration(&quot;PT5H&quot;)&quot;

abs(duration(&quot;-P2M&quot;))
// duration(&quot;P2M&quot;)
</code></pre>
`}],n=[{name:"fromAi",type:"function",params:[{name:"value"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns the unmodified <code>value</code> parameter, which must be a FEEL variable reference in the form <code>toolCall.&lt;parameterName&gt;</code> (for example, <code>toolCall.userId</code>).</p>
<ul>
<li>The purpose of this function is solely to tag the value as being generated by an AI integration.</li>
<li>The actual handling is not performed by the FEEL engine, but by a custom integration such as a connector or a job worker.</li>
</ul>
<p>The main use case of this function is for <a href="https://docs.camunda.io/docs/components/connectors/out-of-the-box-connectors/agentic-ai-aiagent-tool-definitions">tool definitions</a> used by the <a href="https://docs.camunda.io/docs/components/connectors/out-of-the-box-connectors/agentic-ai-aiagent">AI Agent connector</a>.</p>
<p>See the following function overloads for additional function parameters.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">fromAi(value: Any): Any
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">fromAi(toolCall.searchQuery)
// toolCall.searchQuery contents

fromAi(toolCall.userId)
// toolCall.userId contents
</code></pre>
`,engines:{camunda:">=8.8"}},{name:"fromAi",type:"function",params:[{name:"value"},{name:"description"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns the unmodified <code>value</code> parameter, which must be a FEEL variable reference in the form <code>toolCall.&lt;parameterName&gt;</code> (for example, <code>toolCall.userId</code>).</p>
<p>In addition to the previous overload, it also accepts an optional <code>description</code> parameter to provide a textual description of the value. The description must be <code>null</code> or a string constant.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">fromAi(value: Any, description: string): Any
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">fromAi(toolCall.searchQuery, &quot;The search query used to find the best match.&quot;)
// toolCall.searchQuery contents

fromAi(toolCall.searchQuery, null)
// toolCall.searchQuery contents
</code></pre>
`,engines:{camunda:">=8.8"}},{name:"fromAi",type:"function",params:[{name:"value"},{name:"description"},{name:"type"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns the unmodified <code>value</code> parameter, which must be a FEEL variable reference in the form <code>toolCall.&lt;parameterName&gt;</code> (for example, <code>toolCall.userId</code>).</p>
<p>In addition to the previous overload, it also accepts an optional <code>type</code> parameter to provide type information about the value. The type must be <code>null</code> or a string constant.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">fromAi(value: Any, description: string, type: string): Any
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">fromAi(toolCall.searchQuery, &quot;The search query used to find the best match.&quot;, &quot;string&quot;)
// toolCall.searchQuery contents

fromAi(toolCall.userId, &quot;The user&#39;s ID&quot;, &quot;number&quot;)
// toolCall.userId contents

fromAi(toolCall.userId, null, &quot;number&quot;)
// toolCall.userId contents

fromAi(value: toolCall.userId, type: &quot;number&quot;)
// toolCall.userId contents
</code></pre>
`,engines:{camunda:">=8.8"}},{name:"fromAi",type:"function",params:[{name:"value"},{name:"description"},{name:"type"},{name:"schema"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns the unmodified <code>value</code> parameter, which must be a FEEL variable reference in the form <code>toolCall.&lt;parameterName&gt;</code> (for example, <code>toolCall.userId</code>).</p>
<p>In addition to the previous overload, it also accepts an optional <code>schema</code> parameter to provide a (partial) <a href="https://json-schema.org/">JSON schema</a> for the value.</p>
<ul>
<li>The schema must be <code>null</code> or a context (map) containing only constant values. For example, function calls within the schema are not supported.</li>
<li>The schema is not validated by the FEEL engine but might be by a custom integration consuming the information.</li>
<li>From the engine side it is possible to specify both a <code>type</code> and a <code>schema</code>, and it depends on the integration as to which value takes precedence. The <a href="https://docs.camunda.io/docs/components/connectors/out-of-the-box-connectors/agentic-ai-aiagent">AI Agent connector</a> will override any type specified in the schema if the <code>type</code> parameter is also provided.</li>
</ul>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">fromAi(value: Any, description: string, type: string, schema: context): Any
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">fromAi(toolCall.documentType, &quot;The document type to provide&quot;, &quot;string&quot;, {
  enum: [&quot;invoice&quot;, &quot;receipt&quot;, &quot;contract&quot;]
})
// toolCall.documentType contents

fromAi(value: toolCall.documentType, description: &quot;The document type to provide&quot;, schema: {
  type: &quot;string&quot;,
  enum: [&quot;invoice&quot;, &quot;receipt&quot;, &quot;contract&quot;]
})
// toolCall.documentType contents

fromAi(toolCall.tags, &quot;Tags to apply to the blog post&quot;, &quot;array&quot;, {
  items: {
    type: &quot;string&quot;
  }
})
// toolCall.tags contents
</code></pre>
`,engines:{camunda:">=8.8"}},{name:"fromAi",type:"function",params:[{name:"value"},{name:"description"},{name:"type"},{name:"schema"},{name:"options"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns the unmodified <code>value</code> parameter, which must be a FEEL variable reference in the form <code>toolCall.&lt;parameterName&gt;</code> (for example, <code>toolCall.userId</code>).</p>
<p>In addition to the previous overload, it also accepts an optional <code>options</code> parameter to provide additional options for the integration handling the value definition.</p>
<ul>
<li>The options parameter must be <code>null</code> or a context (map) containing only constant values. For example, function calls within options are not supported.</li>
</ul>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">fromAi(value: Any, description: string, type: string, schema: context, options: context): Any
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">fromAi(toolCall.documentType, &quot;The document type to provide&quot;, &quot;string&quot;, null, {
  required: false
})
// toolCall.documentType contents

fromAi(value: toolCall.documentType, options: {
  required: false
})
// toolCall.documentType contents
</code></pre>
`,engines:{camunda:">=8.8"}},{name:"is defined",type:"function",params:[{name:"value"}],info:`<p><em>Camunda Extension</em></p>
<p>Checks if a given value is not <code>null</code>. If the value is <code>null</code> then the function returns <code>false</code>.
Otherwise, the function returns <code>true</code>.</p>
<p>The function requires one argument. Calling <code>is defined()</code> without an argument is invalid.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">is defined(value: Any): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">is defined(1)
// true

is defined(null)
// false

is defined(x)
// false - if no variable &quot;x&quot; exists

is defined(x.y)
// false - if no variable &quot;x&quot; exists or it doesn&#39;t have a property &quot;y&quot;

is defined()
// error - expected one argument
</code></pre>
<p>:::caution Breaking change</p>
<p>This function worked differently in previous versions. It returned <code>true</code> if the value was <code>null</code>.
Since this version, the function returns <code>false</code> if the value is <code>null</code>.</p>
<p>:::</p>
`},{name:"get or else",type:"function",params:[{name:"value"},{name:"default"}],info:`<p><em>Camunda Extension</em></p>
<p>Return the provided value parameter if not <code>null</code>, otherwise return the default parameter</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">get or else(value: Any, default: Any): Any
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">get or else(&quot;this&quot;, &quot;default&quot;)
// &quot;this&quot;

get or else(null, &quot;default&quot;)
// &quot;default&quot;

get or else(null, null)
// null
</code></pre>
`,engines:{camunda:">=8.3"}},{name:"assert",type:"function",params:[{name:"value"},{name:"condition"}],info:`<p><em>Camunda Extension</em></p>
<p>Verify that the given condition is met. If the condition is <code>true</code>, the function returns the value.
Otherwise, the evaluation fails with an error.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">assert(value: Any, condition: Any)
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">assert(x, x != null)
// &quot;value&quot; - if x is &quot;value&quot;
// error - if x is null or doesn&#39;t exist

assert(x, x &gt;= 0)
// 4 - if x is 4
// error - if x is less than zero
</code></pre>
`,engines:{camunda:">=8.3"}},{name:"assert",type:"function",params:[{name:"value"},{name:"condition"},{name:"cause"}],info:`<p><em>Camunda Extension</em></p>
<p>Verify that the given condition is met. If the condition is <code>true</code>, the function returns the value.
Otherwise, the evaluation fails with an error containing the given message.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">assert(value: Any, condition: Any, cause: String)
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">assert(x, x != null, &quot;&#39;x&#39; should not be null&quot;)
// &quot;value&quot; - if x is &quot;value&quot;
// error(&#39;x&#39; should not be null) - if x is null or doesn&#39;t exist

assert(x, x &gt;= 0, &quot;&#39;x&#39; should be positive&quot;)
// 4 - if x is 4
// error(&#39;x&#39; should be positive) - if x is less than zero
</code></pre>
`,engines:{camunda:">=8.3"}},{name:"get value",type:"function",params:[{name:"context"},{name:"keys"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns the value of the context entry for a context path defined by the given keys.</p>
<p>If <code>keys</code> contains the keys <code>[k1, k2]</code> then it returns the value at the nested entry <code>k1.k2</code> of the context.</p>
<p>If <code>keys</code> are empty or the nested entry defined by the keys doesn&#39;t exist in the context, it returns <code>null</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">get value(context: context, keys: list&lt;string&gt;): Any
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">get value({x:1, y: {z:0}}, [&quot;y&quot;, &quot;z&quot;])
// 0

get value({x: {y: {z:0}}}, [&quot;x&quot;, &quot;y&quot;])
// {z:0}

get value({a: {b: 3}}, [&quot;b&quot;])
// null
</code></pre>
`},{name:"context put",type:"function",params:[{name:"context"},{name:"key"},{name:"value"}],info:`<p>Adds a new entry with the given key and value to the context. Returns a new context that includes the entry.</p>
<p>If an entry for the same key already exists in the context, it overrides the value.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">context put(context: context, key: string, value: Any): context
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">context put({x:1}, &quot;y&quot;, 2)
// {x:1, y:2}
</code></pre>
<p>:::info
The function <code>context put()</code> replaced the previous function <code>put()</code> (Camunda Extension). The
previous function is deprecated and should not be used anymore.
:::</p>
`},{name:"context merge",type:"function",params:[{name:"contexts"}],info:`<p>Union the given contexts. Returns a new context that includes all entries of the given contexts.</p>
<p>If an entry for the same key already exists in a context, it overrides the value. The entries are overridden in the same order as in the list of contexts.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">context merge(contexts: list&lt;context&gt;): context
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">context merge([{x:1}, {y:2}])
// {x:1, y:2}

context merge([{x:1, y: 0}, {y:2}])
// {x:1, y:2}
</code></pre>
<p>:::info
The function <code>context merge()</code> replaced the previous function <code>put all()</code> (Camunda Extension). The
previous function is deprecated and should not be used anymore.
:::</p>
`,engines:{camunda:">=8.2"}},{name:"date and time",type:"function",params:[{name:"date"},{name:"timezone"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns the given date and time value at the given timezone.</p>
<p>If <code>date</code> has a different timezone than <code>timezone</code> then it adjusts the time to match the local time of <code>timezone</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">date and time(date: date and time, timezone: string): date and time
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">date and time(@&quot;2020-07-31T14:27:30@Europe/Berlin&quot;, &quot;America/Los_Angeles&quot;)
// date and time(&quot;2020-07-31T05:27:30@America/Los_Angeles&quot;)

date and time(@&quot;2020-07-31T14:27:30&quot;, &quot;Z&quot;)
// date and time(&quot;2020-07-31T12:27:30Z&quot;)
</code></pre>
`},{name:"duplicate values",type:"function",params:[{name:"list"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns all duplicate values of the given list.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">duplicate values(list: list): list
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">duplicate values([1,2,3,2,1])
// [1,2]
</code></pre>
`,engines:{camunda:">=8.3"}},{name:"string join",type:"function",params:[{name:"list"},{name:"delimiter"},{name:"prefix"},{name:"suffix"}],info:`<p><em>Camunda Extension</em></p>
<p>Joins a list of strings into a single string. This is similar to
Java&#39;s <a href="https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/stream/Collectors.html#joining(java.lang.CharSequence,java.lang.CharSequence,java.lang.CharSequence)">joining</a>
function.</p>
<p>If an item of the list is <code>null</code>, the item is ignored for the result string. If an item is
neither a string nor <code>null</code>, the function returns <code>null</code> instead of a string.</p>
<p>The resulting string starts with <code>prefix</code>, contains a <code>delimiter</code> between each element, and ends
with <code>suffix</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">string join(list: list&lt;string&gt;, delimiter: string, prefix: string, suffix: string): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">string join([&quot;a&quot;,&quot;b&quot;,&quot;c&quot;], &quot;, &quot;, &quot;[&quot;, &quot;]&quot;)
// &quot;[a, b, c]&quot;
</code></pre>
`},{name:"is empty",type:"function",params:[{name:"list"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns <code>true</code> if the given list is empty. Otherwise, returns <code>false</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">is empty(list: list): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">is empty([])
// true

is empty([1,2,3])
// false
</code></pre>
`,engines:{camunda:">=8.6"}},{name:"partition",type:"function",params:[{name:"list"},{name:"size"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns consecutive sublists of a list, each of the same size (the final list may be smaller).</p>
<p>If <code>size</code> is less than <code>0</code>, it returns <code>null</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">partition(list: list, size: number): list
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">partition([1,2,3,4,5], 2)
// [[1,2], [3,4], [5]]

partition([], 2)
// []

partition([1,2], 0)
// null
</code></pre>
`,engines:{camunda:">=8.7"}},{name:"random number",type:"function",params:[],info:`<p><em>Camunda Extension</em></p>
<p>Returns a random number between <code>0</code> and <code>1</code>.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">random number(): number
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">random number()
// 0.9701618132579795
</code></pre>
`,engines:{camunda:">=8.2"}},{name:"extract",type:"function",params:[{name:"string"},{name:"pattern"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns all matches of the pattern in the given string. Returns an empty list if the pattern doesn&#39;t
match.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">extract(string: string, pattern: string): list&lt;string&gt;
</code></pre>
<p>The <code>pattern</code> is a string that contains a regular expression.</p>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">extract(&quot;references are 1234, 1256, 1378&quot;, &quot;12[0-9]*&quot;)
// [&quot;1234&quot;,&quot;1256&quot;]
</code></pre>
`},{name:"trim",type:"function",params:[{name:"string"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns the given string without leading and trailing spaces.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">trim(string: string): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">trim(&quot;  hello world  &quot;)
// &quot;hello world&quot;

trim(&quot;hello   world &quot;)
// &quot;hello   world&quot;
</code></pre>
`,engines:{camunda:">=8.6"}},{name:"uuid",type:"function",params:[],info:`<p><em>Camunda Extension</em></p>
<p>Returns a UUID (Universally Unique Identifier) with 36 characters.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">uuid(): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">uuid()
// &quot;7793aab1-d761-4d38-916b-b7270e309894&quot;
</code></pre>
`,engines:{camunda:">=8.6"}},{name:"to base64",type:"function",params:[{name:"value"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns the given string encoded in Base64 format.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">to base64(value: string): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">to base64(&quot;FEEL&quot;)
// &quot;RkVFTA==&quot;
</code></pre>
`,engines:{camunda:">=8.6"}},{name:"from base64",type:"function",params:[{name:"value"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns the given Base64 encoded string decoded to a plain string.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">from base64(value: string): string
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">from base64(&quot;RkVFTA==&quot;)
// &quot;FEEL&quot;
</code></pre>
`,engines:{camunda:">=8.9"}},{name:"is blank",type:"function",params:[{name:"string"}],info:`<p><em>Camunda Extension</em></p>
<p>Returns <code>true</code> if the given string is blank (empty or contains only whitespaces).</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">is blank(string: string): boolean
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">is blank(&quot;&quot;)
// true

is blank(&quot; &quot;)
// true

is blank(&quot;hello world&quot;)
// false
</code></pre>
`,engines:{camunda:">=8.8"}},{name:"last day of month",type:"function",params:[{name:"date"}],info:`<p><em>Camunda Extension</em></p>
<p>Takes the month of the given date or date-time value and returns the last day of this month.</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">last day of month(date: date): date
</code></pre>
<pre><code class="language-feel">last day of month(date: date and time): date
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">last day of month(date(&quot;2022-10-01&quot;))
// date(&quot;2022-10-31&quot;))

last day of month(date and time(&quot;2022-10-16T12:00:00&quot;))
// date(&quot;2022-10-31&quot;))
</code></pre>
`,engines:{camunda:">=8.2"}}],t=[...e,...n],o=[{name:"get or else",type:"function",params:[{name:"value"},{name:"default"}],info:`<p><em>Camunda Extension</em></p>
<p>Return the provided value parameter if not <code>null</code>, otherwise return the default parameter</p>
<p><strong>Function signature</strong></p>
<pre><code class="language-feel">get or else(value: Any, default: Any): Any
</code></pre>
<p><strong>Examples</strong></p>
<pre><code class="language-feel">get or else(&quot;this&quot;, &quot;default&quot;)
// &quot;this&quot;

get or else(null, &quot;default&quot;)
// &quot;default&quot;

get or else(null, null)
// null
</code></pre>
`,engines:{camunda:">=8.3"}}];export{t as camundaBuiltins,n as camundaExtensions,o as camundaReservedNameBuiltins,e as feelBuiltins};
//# sourceMappingURL=feel-builtins.mjs.map