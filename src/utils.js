function createArrow(start, arrow) {
	var end = start + arrow;
	var right = arrow.clone();
	right.length = 5;
	right.angle += 135;
	var left = right.clone();
	left.angle += 90;
	right = end + right;
	left = end + left;
	var path = new Path(start, end, right, left, end);
	return path;
}